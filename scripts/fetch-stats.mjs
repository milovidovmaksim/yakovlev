#!/usr/bin/env node
// Собирает статистику из API Яндекс.Метрики и кладёт её в assets/data/stats.json
// в зашифрованном виде (AES-GCM, ключ — STATS_KEY).
//
// Токен Метрики и ключ шифрования живут только в секретах GitHub Actions
// и никогда не попадают в репозиторий. Данные тоже лежат в репозитории
// только в зашифрованном виде, поэтому даже публичный репозиторий безопасен.
//
// Запуск: node scripts/fetch-stats.mjs
// Переменные окружения: METRIKA_TOKEN, METRIKA_COUNTER_ID, STATS_KEY,
//                       GOAL_NAME (по умолчанию max_click), GOAL_ID, STATS_DAYS, STATS_TIMEZONE.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_FILE = join(ROOT, "assets", "data", "stats.json");

const API = "https://api-metrika.yandex.net";
const TOKEN = (process.env.METRIKA_TOKEN || "").trim();
const COUNTER_ID = (process.env.METRIKA_COUNTER_ID || "").trim();
const STATS_KEY = process.env.STATS_KEY || "";
const GOAL_NAME = (process.env.GOAL_NAME || "max_click").trim().toLowerCase();
const DAYS = Math.min(Math.max(Number(process.env.STATS_DAYS) || 120, 30), 365);
const TIMEZONE = process.env.STATS_TIMEZONE || "Asia/Yekaterinburg";

function fail(message) {
  console.error("Ошибка: " + message);
  process.exit(1);
}

if (!TOKEN) fail("не задан METRIKA_TOKEN (секрет репозитория)");
if (!COUNTER_ID) fail("не задан METRIKA_COUNTER_ID (секрет репозитория)");
if (STATS_KEY.length < 16) fail("STATS_KEY должен быть длиной хотя бы 16 символов");
if (!/^\d+$/.test(COUNTER_ID)) fail("METRIKA_COUNTER_ID должен состоять только из цифр");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(path, params) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(url, {
      headers: { Authorization: "OAuth " + TOKEN, Accept: "application/json" }
    });

    if (response.ok) return response.json();

    const text = (await response.text()).slice(0, 300);
    lastError = new Error(`Метрика API ${response.status} (${url.pathname}): ${text}`);

    // 403 — обычно не выдан доступ metrika:read, повторять бессмысленно.
    if (response.status < 500) break;
    if (attempt < 3) await sleep(2000 * attempt);
  }

  throw lastError;
}

function toIsoDay(dimension) {
  const candidates = [dimension.name, dimension.id].filter(Boolean).map(String);
  for (const value of candidates) {
    const match = value.match(/(\d{4})-?(\d{2})-?(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

function isoToday() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function shiftDay(isoDay, deltaDays) {
  const [year, month, day] = isoDay.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

async function resolveGoalId() {
  if (process.env.GOAL_ID) return Number(process.env.GOAL_ID);

  const data = await getJson(`/management/v1/counter/${COUNTER_ID}/goals`);
  const goals = data.goals || [];
  const normalize = (value) => String(value || "").trim().toLowerCase();

  const goal = goals.find(
    (item) =>
      normalize(item.name) === GOAL_NAME ||
      (item.conditions || []).some(
        (condition) =>
          normalize(condition.url) === GOAL_NAME ||
          normalize(condition.url).includes(GOAL_NAME)
      )
  );

  if (!goal) {
    console.warn(
      `Цель «${GOAL_NAME}» не найдена в счётчике ${COUNTER_ID}. ` +
        "Посетители будут считаться, клики — нет."
    );
    return null;
  }

  console.log(`Цель «${GOAL_NAME}»: id=${goal.id}, название «${goal.name}»`);
  return Number(goal.id);
}

function base64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

async function encrypt(payload, passphrase) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const iterations = 200000;
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(payload))
  );

  return {
    v: 1,
    updated: payload.updated,
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt: base64(salt) },
    iv: base64(iv),
    data: base64(new Uint8Array(cipher))
  };
}

function fromBase64(value) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function decryptForCompare(bundle, passphrase) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(bundle.kdf.salt),
      iterations: bundle.kdf.iterations,
      hash: bundle.kdf.hash
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(bundle.iv) },
    key,
    fromBase64(bundle.data)
  );

  return JSON.parse(new TextDecoder().decode(plain));
}

// Шифр каждый раз получается разным (случайные salt и iv), поэтому сравниваем
// расшифрованное содержимое — иначе бот коммитил бы файл каждый час впустую.
async function hasSameData(payload) {
  let existing;
  try {
    existing = JSON.parse(await readFile(OUT_FILE, "utf8"));
  } catch (error) {
    return false;
  }

  try {
    const decrypted = await decryptForCompare(existing, STATS_KEY);
    return JSON.stringify(decrypted.days) === JSON.stringify(payload.days);
  } catch (error) {
    return false;
  }
}

async function main() {
  const goalId = await resolveGoalId();

  const date2 = isoToday();
  const date1 = shiftDay(date2, -(DAYS - 1));
  const metrics = goalId ? `ym:s:users,ym:s:goal${goalId}reaches` : "ym:s:users";

  console.log(`Запрашиваю счётчик ${COUNTER_ID} за ${date1}…${date2}`);

  const report = await getJson("/stat/v1/data", {
    ids: COUNTER_ID,
    metrics,
    dimensions: "ym:s:date",
    date1,
    date2,
    sort: "ym:s:date",
    limit: 1000,
    accuracy: "full"
  });

  const byDay = new Map();
  for (const row of report.data || []) {
    const isoDay = row.dimensions && row.dimensions[0] ? toIsoDay(row.dimensions[0]) : null;
    if (!isoDay) continue;

    const visitors = Math.round(Number(row.metrics[0]) || 0);
    const clicks = goalId ? Math.round(Number(row.metrics[1]) || 0) : null;
    byDay.set(isoDay, { d: isoDay, v: visitors, c: clicks });
  }

  // Заполняем пропущенные дни нулями, чтобы страница не занималась арифметикой дат.
  const days = [];
  for (let offset = 0; offset < DAYS; offset++) {
    const isoDay = shiftDay(date1, offset);
    days.push(byDay.get(isoDay) || { d: isoDay, v: 0, c: goalId ? 0 : null });
  }

  const totalVisitors = days.reduce((sum, day) => sum + day.v, 0);
  const totalClicks = goalId ? days.reduce((sum, day) => sum + (day.c || 0), 0) : null;

  const payload = {
    updated: new Date().toISOString(),
    timezone: TIMEZONE,
    goal: goalId ? { id: goalId, name: GOAL_NAME } : null,
    days
  };

  if (await hasSameData(payload)) {
    console.log("Данные не изменились, файл не трогаю.");
    return;
  }

  const encrypted = await encrypt(payload, STATS_KEY);
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(encrypted) + "\n", "utf8");

  console.log(
    `Готово: ${days.length} дней, посетителей ${totalVisitors}, ` +
      `кликов ${totalClicks === null ? "нет цели" : totalClicks}. Файл: ${OUT_FILE}`
  );
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
