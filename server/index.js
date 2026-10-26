import crypto from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDirectory, "..");
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || path.join(projectRoot, "storage", "uploads"));
const dataDirectory = path.join(projectRoot, "storage", "data");
const distDirectory = path.join(projectRoot, "dist");
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || "0.0.0.0";
const maxUploadBytes = 20 * 1024 * 1024;

function loadEnvFile() {
  try {
    const content = readFileSync(path.join(projectRoot, ".env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Missing .env is fine when the process supplies its own variables.
  }
}

loadEnvFile();

const mysqlPool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "posebook",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "posebook",
  waitForConnections: true,
  connectionLimit: 10,
  charset: "utf8mb4_unicode_ci",
});

const tokenSessions = new Map();
let database = null;
let saveQueue = Promise.resolve();

function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto.scryptSync(password, salt, 64).toString("hex"),
  };
}

function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = crypto.scryptSync(password, user.salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  tokenSessions.set(token, user.id);
  return token;
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function requireUser(request) {
  const userId = tokenSessions.get(getBearerToken(request));
  const user = database.users.find((candidate) => candidate.id === userId);
  if (!user) {
    const error = new Error("请先登录。");
    error.statusCode = 401;
    throw error;
  }
  return user;
}

function getOptionalUser(request) {
  const userId = tokenSessions.get(getBearerToken(request));
  return database.users.find((candidate) => candidate.id === userId) || null;
}

async function createDefaultDatabase() {
  const password = hashPassword("admin123");
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "admin",
        username: "admin",
        passwordHash: password.hash,
        salt: password.salt,
        role: "superadmin",
        createdAt: now,
      },
    ],
    characters: [],
  };
}

const mysqlSchemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(24) NOT NULL UNIQUE,
      password_hash CHAR(128) NOT NULL,
      salt CHAR(64) NOT NULL,
      role VARCHAR(24) NOT NULL DEFAULT 'user',
      created_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS characters (
      id VARCHAR(64) PRIMARY KEY,
      name VARCHAR(20) NOT NULL,
      tag VARCHAR(120) NOT NULL,
      accent VARCHAR(24) NOT NULL,
      created_by VARCHAR(64),
      created_by_name VARCHAR(24),
      created_at VARCHAR(64) NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS actions (
      id VARCHAR(64) PRIMARY KEY,
      character_id VARCHAR(64) NOT NULL,
      name VARCHAR(30) NOT NULL,
      image TEXT NOT NULL,
      source_name VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      created_by VARCHAR(64),
      created_by_name VARCHAR(24),
      created_at VARCHAR(64) NOT NULL,
      updated_by VARCHAR(64),
      updated_by_name VARCHAR(24),
      updated_at VARCHAR(64) NOT NULL,
      INDEX idx_actions_character (character_id),
      CONSTRAINT fk_actions_character FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS action_user_states (
      action_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      notes TEXT NOT NULL,
      completed TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (action_id, user_id),
      INDEX idx_state_user (user_id),
      CONSTRAINT fk_state_action FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
      CONSTRAINT fk_state_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
  `
    CREATE TABLE IF NOT EXISTS action_favorites (
      action_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      PRIMARY KEY (action_id, user_id),
      INDEX idx_favorite_user (user_id),
      CONSTRAINT fk_favorite_action FOREIGN KEY (action_id) REFERENCES actions(id) ON DELETE CASCADE,
      CONSTRAINT fk_favorite_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `,
];

async function ensureMysqlSchema() {
  for (const statement of mysqlSchemaStatements) {
    await mysqlPool.query(statement);
  }
}

async function loadDatabaseFromMysql() {
  const [userRows] = await mysqlPool.query(`
    SELECT id, username, password_hash, salt, role, created_at
    FROM users
    ORDER BY created_at
  `);
  if (!userRows.length) return null;

  const [characterRows] = await mysqlPool.query(`
    SELECT id, name, tag, accent, created_by, created_by_name, created_at
    FROM characters
    ORDER BY created_at
  `);
  const [actionRows] = await mysqlPool.query(`
    SELECT
      id, character_id, name, image, source_name, sort_order,
      created_by, created_by_name, created_at,
      updated_by, updated_by_name, updated_at
    FROM actions
    ORDER BY character_id, sort_order
  `);
  const [stateRows] = await mysqlPool.query(`
    SELECT action_id, user_id, notes, completed
    FROM action_user_states
  `);
  const [favoriteRows] = await mysqlPool.query(`
    SELECT action_id, user_id
    FROM action_favorites
  `);

  const statesByAction = new Map();
  for (const row of stateRows) {
    if (!statesByAction.has(row.action_id)) statesByAction.set(row.action_id, []);
    statesByAction.get(row.action_id).push({
      userId: row.user_id,
      notes: row.notes,
      completed: Boolean(row.completed),
    });
  }

  const favoritesByAction = new Map();
  for (const row of favoriteRows) {
    if (!favoritesByAction.has(row.action_id)) favoritesByAction.set(row.action_id, []);
    favoritesByAction.get(row.action_id).push(row.user_id);
  }

  const actionsByCharacter = new Map();
  for (const row of actionRows) {
    const action = {
      id: row.id,
      name: row.name,
      image: row.image,
      sourceName: row.source_name,
      favoritedBy: favoritesByAction.get(row.id) || [],
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
      updatedBy: row.updated_by,
      updatedByName: row.updated_by_name,
      updatedAt: row.updated_at,
      userStates: {},
    };
    for (const state of statesByAction.get(row.id) || []) {
      action.userStates[state.userId] = {
        notes: state.notes,
        completed: state.completed,
      };
    }
    if (!actionsByCharacter.has(row.character_id)) actionsByCharacter.set(row.character_id, []);
    actionsByCharacter.get(row.character_id).push(action);
  }

  return {
    users: userRows.map((row) => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      salt: row.salt,
      role: row.role,
      createdAt: row.created_at,
    })),
    characters: characterRows.map((row) => ({
      id: row.id,
      name: row.name,
      tag: row.tag,
      accent: row.accent,
      actions: actionsByCharacter.get(row.id) || [],
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      createdAt: row.created_at,
    })),
  };
}

async function writeDatabaseSnapshot() {
  const connection = await mysqlPool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM action_user_states");
    await connection.query("DELETE FROM action_favorites");
    await connection.query("DELETE FROM actions");
    await connection.query("DELETE FROM characters");
    await connection.query("DELETE FROM users");

    for (const user of database.users) {
      await connection.query(
        `INSERT INTO users (id, username, password_hash, salt, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.id, user.username, user.passwordHash, user.salt, user.role, user.createdAt],
      );
    }

    for (const character of database.characters) {
      await connection.query(
        `INSERT INTO characters (id, name, tag, accent, created_by, created_by_name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          character.id,
          character.name,
          character.tag,
          character.accent,
          character.createdBy,
          character.createdByName,
          character.createdAt,
        ],
      );

      character.actions.forEach((action, index) => {
        action.__sortOrder = index;
      });
      for (const action of character.actions) {
        await connection.query(
          `INSERT INTO actions (
            id, character_id, name, image, source_name, sort_order,
            created_by, created_by_name, created_at,
            updated_by, updated_by_name, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            action.id,
            character.id,
            action.name,
            action.image,
            action.sourceName,
            action.__sortOrder,
            action.createdBy,
            action.createdByName,
            action.createdAt,
            action.updatedBy,
            action.updatedByName,
            action.updatedAt,
          ],
        );
      }
    }

    for (const character of database.characters) {
      for (const action of character.actions) {
        delete action.__sortOrder;
        for (const [userId, state] of Object.entries(action.userStates || {})) {
          await connection.query(
            `INSERT INTO action_user_states (action_id, user_id, notes, completed)
             VALUES (?, ?, ?, ?)`,
            [action.id, userId, state.notes || "", state.completed ? 1 : 0],
          );
        }
        for (const userId of action.favoritedBy || []) {
          await connection.query(
            `INSERT INTO action_favorites (action_id, user_id)
             VALUES (?, ?)`,
            [action.id, userId],
          );
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function loadDatabase() {
  await fs.mkdir(dataDirectory, { recursive: true });
  await ensureMysqlSchema();
  database = await loadDatabaseFromMysql();
  if (database) return;

  database = await createDefaultDatabase();
  await persistDatabase();
}

function persistDatabase() {
  const pending = saveQueue.then(() => writeDatabaseSnapshot());
  saveQueue = pending.catch(() => {});
  return pending;
}

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

await fs.mkdir(uploadDirectory, { recursive: true });
await loadDatabase();

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function detectImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: "png", mimeType: "image/png" };
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return { extension: "gif", mimeType: "image/gif" };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return { extension: "webp", mimeType: "image/webp" };
  }
  if (buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/.test(buffer.subarray(8, 32).toString("ascii"))) {
    return { extension: "avif", mimeType: "image/avif" };
  }
  return null;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxUploadBytes) {
        const error = new Error("图片不能超过 20MB。");
        error.statusCode = 413;
        request.pause();
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function readJsonBody(request) {
  const buffer = await readBody(request);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    const error = new Error("请求内容不是有效的 JSON。");
    error.statusCode = 400;
    throw error;
  }
}

function getOriginalName(request) {
  const encodedName = Array.isArray(request.headers["x-file-name"])
    ? request.headers["x-file-name"][0]
    : request.headers["x-file-name"];
  try {
    return path.basename(decodeURIComponent(encodedName || "reference-image")).slice(0, 200);
  } catch {
    return "reference-image";
  }
}

async function sendFile(request, response, filePath, cacheControl = "no-cache") {
  const fileStats = await fs.stat(filePath);
  if (!fileStats.isFile()) return false;

  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    "Content-Length": fileStats.size,
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  });
  if (request.method === "HEAD") {
    response.end();
  } else {
    createReadStream(filePath).pipe(response);
  }
  return true;
}

async function handleUpload(request, response) {
  requireUser(request);
  const contentLength = Number(request.headers["content-length"] || 0);
  if (contentLength > maxUploadBytes) {
    request.resume();
    return sendJson(response, 413, { message: "图片不能超过 20MB。" });
  }

  const fileBuffer = await readBody(request);
  if (!fileBuffer.length) {
    return sendJson(response, 400, { message: "请选择需要上传的图片。" });
  }

  const detectedType = detectImageType(fileBuffer);
  if (!detectedType) {
    return sendJson(response, 415, { message: "仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片。" });
  }

  const filename = `${Date.now()}-${crypto.randomUUID()}.${detectedType.extension}`;
  await fs.writeFile(path.join(uploadDirectory, filename), fileBuffer, { flag: "wx" });
  return sendJson(response, 201, {
    url: `/uploads/${filename}`,
    filename,
    originalName: getOriginalName(request),
    mimeType: detectedType.mimeType,
    size: fileBuffer.length,
  });
}

function findCharacter(characterId) {
  const character = database.characters.find((candidate) => candidate.id === characterId);
  if (!character) {
    const error = new Error("角色不存在。");
    error.statusCode = 404;
    throw error;
  }
  return character;
}

function findAction(character, actionId) {
  const action = character.actions.find((candidate) => candidate.id === actionId);
  if (!action) {
    const error = new Error("动作不存在。");
    error.statusCode = 404;
    throw error;
  }
  return action;
}

function serializeAction(action, user) {
  const userState = user ? action.userStates?.[user.id] : null;
  return {
    id: action.id,
    name: action.name,
    image: action.image,
    sourceName: action.sourceName,
    notes: userState?.notes || "",
    completed: Boolean(userState?.completed),
    favoritedBy: user ? action.favoritedBy || [] : [],
    createdBy: action.createdBy,
    createdByName: action.createdByName,
    createdAt: action.createdAt,
    updatedBy: action.updatedBy,
    updatedByName: action.updatedByName,
    updatedAt: action.updatedAt,
  };
}

function serializeCharacter(character, user) {
  return {
    ...character,
    actions: character.actions.map((action) => serializeAction(action, user)),
  };
}

async function handleRegister(request, response) {
  const body = await readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username)) {
    return sendJson(response, 400, { message: "用户名需为 2-24 位中英文、数字、下划线或短横线。" });
  }
  if (password.length < 4 || password.length > 128) {
    return sendJson(response, 400, { message: "密码长度需在 4-128 位之间。" });
  }
  if (database.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
    return sendJson(response, 409, { message: "用户名已存在。" });
  }

  const passwordData = hashPassword(password);
  const user = {
    id: createId("user"),
    username,
    passwordHash: passwordData.hash,
    salt: passwordData.salt,
    role: "user",
    createdAt: new Date().toISOString(),
  };
  database.users.push(user);
  await persistDatabase();
  return sendJson(response, 201, { token: createSession(user), user: publicUser(user) });
}

async function handleLogin(request, response) {
  const body = await readJsonBody(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = database.users.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());

  if (!user || !verifyPassword(password, user)) {
    return sendJson(response, 401, { message: "用户名或密码错误。" });
  }
  return sendJson(response, 200, { token: createSession(user), user: publicUser(user) });
}

async function handleGetMe(request, response) {
  return sendJson(response, 200, { user: publicUser(requireUser(request)) });
}

async function handleLogout(request, response) {
  tokenSessions.delete(getBearerToken(request));
  return sendJson(response, 200, { ok: true });
}

async function handleChangePassword(request, response) {
  const user = requireUser(request);
  const body = await readJsonBody(request);
  const currentPassword = String(body.currentPassword || "");
  const newPassword = String(body.newPassword || "");

  if (!verifyPassword(currentPassword, user)) {
    return sendJson(response, 400, { message: "当前密码不正确。" });
  }
  if (newPassword.length < 4 || newPassword.length > 128) {
    return sendJson(response, 400, { message: "新密码长度需在 4-128 位之间。" });
  }

  const passwordData = hashPassword(newPassword);
  user.passwordHash = passwordData.hash;
  user.salt = passwordData.salt;
  await persistDatabase();
  return sendJson(response, 200, { ok: true });
}

async function handleGetCharacters(request, response) {
  const user = getOptionalUser(request);
  return sendJson(response, 200, database.characters.map((character) => serializeCharacter(character, user)));
}

async function handleCreateCharacter(request, response) {
  const user = requireUser(request);
  const body = await readJsonBody(request);
  const name = String(body.name || "").trim();
  const tag = String(body.tag || "").trim() || "新的拍摄企划";
  const accent = String(body.accent || "#ff5c3a").trim();

  if (!name || name.length > 20) {
    return sendJson(response, 400, { message: "角色名称需为 1-20 个字符。" });
  }

  const character = {
    id: createId("character"),
    name,
    tag,
    accent,
    actions: [],
    createdBy: user.id,
    createdByName: user.username,
    createdAt: new Date().toISOString(),
  };
  database.characters.push(character);
  await persistDatabase();
  return sendJson(response, 201, serializeCharacter(character, user));
}

async function handleUpdateCharacter(request, response, characterId) {
  const user = requireUser(request);
  const character = findCharacter(characterId);

  if (character.createdBy !== user.id && user.role !== "superadmin") {
    return sendJson(response, 403, { message: "只能修改自己创建的角色。" });
  }

  const body = await readJsonBody(request);
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 20) {
      return sendJson(response, 400, { message: "角色名称需为 1-20 个字符。" });
    }
    character.name = name;
  }
  if (body.tag !== undefined) {
    const tag = String(body.tag).trim();
    if (tag.length > 120) {
      return sendJson(response, 400, { message: "企划标签不能超过 120 个字符。" });
    }
    character.tag = tag;
  }
  if (body.accent !== undefined) {
    character.accent = String(body.accent).trim() || character.accent;
  }

  await persistDatabase();
  return sendJson(response, 200, serializeCharacter(character, user));
}

async function handleDeleteCharacter(request, response, characterId) {
  const user = requireUser(request);
  const character = findCharacter(characterId);

  if (character.createdBy !== user.id && user.role !== "superadmin") {
    return sendJson(response, 403, { message: "只能删除自己创建的角色。" });
  }

  database.characters = database.characters.filter((candidate) => candidate.id !== characterId);
  await persistDatabase();
  return sendJson(response, 200, { ok: true, id: characterId });
}

async function handleAddAction(request, response, characterId) {
  const user = requireUser(request);
  const character = findCharacter(characterId);
  const body = await readJsonBody(request);
  const name = String(body.name || "").trim();
  const image = String(body.image || "").trim();
  const sourceName = String(body.sourceName || "").trim() || image.split("/").pop() || "参考图片";
  const notes = String(body.notes || "");

  if (!name || name.length > 30) {
    return sendJson(response, 400, { message: "动作名称需为 1-30 个字符。" });
  }
  if (!image) {
    return sendJson(response, 400, { message: "请提供动作参考图片。" });
  }

  const now = new Date().toISOString();
  const action = {
    id: createId("action"),
    name,
    image,
    sourceName,
    favoritedBy: [],
    createdBy: user.id,
    createdByName: user.username,
    createdAt: now,
    updatedBy: user.id,
    updatedAt: now,
    userStates: {
      [user.id]: {
        notes,
        completed: false,
      },
    },
  };
  character.actions.push(action);
  await persistDatabase();
  return sendJson(response, 201, serializeCharacter(character, user));
}

async function handleUpdateAction(request, response, characterId, actionId) {
  const user = requireUser(request);
  const character = findCharacter(characterId);
  const action = findAction(character, actionId);
  const body = await readJsonBody(request);

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name || name.length > 30) {
      return sendJson(response, 400, { message: "动作名称需为 1-30 个字符。" });
    }
    action.name = name;
  }
  if (body.image !== undefined) {
    const image = String(body.image).trim();
    if (!image) {
      return sendJson(response, 400, { message: "请提供动作参考图片。" });
    }
    action.image = image;
  }
  if (body.sourceName !== undefined) {
    action.sourceName = String(body.sourceName).trim() || action.sourceName;
  }
  if (body.notes !== undefined || typeof body.completed === "boolean") {
    action.userStates ||= {};
    action.userStates[user.id] ||= {};
  }
  if (body.notes !== undefined) {
    action.userStates[user.id].notes = String(body.notes);
  }
  if (typeof body.completed === "boolean") {
    action.userStates[user.id].completed = body.completed;
  }
  if (typeof body.favorite === "boolean") {
    action.favoritedBy = action.favoritedBy || [];
    const favoriteIndex = action.favoritedBy.indexOf(user.id);
    if (body.favorite && favoriteIndex === -1) {
      action.favoritedBy.push(user.id);
    }
    if (!body.favorite && favoriteIndex !== -1) {
      action.favoritedBy.splice(favoriteIndex, 1);
    }
  }

  action.updatedBy = user.id;
  action.updatedByName = user.username;
  action.updatedAt = new Date().toISOString();
  await persistDatabase();
  return sendJson(response, 200, serializeCharacter(character, user));
}

async function handleDeleteAction(request, response, characterId, actionId) {
  const user = requireUser(request);
  const character = findCharacter(characterId);
  const action = findAction(character, actionId);

  if (action.createdBy !== user.id && user.role !== "superadmin") {
    return sendJson(response, 403, { message: "只能删除自己创建的动作。" });
  }

  character.actions = character.actions.filter((candidate) => candidate.id !== actionId);
  await persistDatabase();
  return sendJson(response, 200, serializeCharacter(character, user));
}

const requestHandler = async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
    const pathname = decodeURIComponent(requestUrl.pathname);

    if (request.method === "GET" && pathname === "/api/health") {
      return sendJson(response, 200, { status: "ok", uploadLimitMb: 20 });
    }
    if (request.method === "POST" && pathname === "/api/register") {
      return await handleRegister(request, response);
    }
    if (request.method === "POST" && pathname === "/api/login") {
      return await handleLogin(request, response);
    }
    if (request.method === "GET" && pathname === "/api/me") {
      return await handleGetMe(request, response);
    }
    if (request.method === "POST" && pathname === "/api/logout") {
      return await handleLogout(request, response);
    }
    if (request.method === "POST" && pathname === "/api/change-password") {
      return await handleChangePassword(request, response);
    }
    if (request.method === "GET" && pathname === "/api/characters") {
      return await handleGetCharacters(request, response);
    }
    if (request.method === "POST" && pathname === "/api/characters") {
      return await handleCreateCharacter(request, response);
    }

    const actionRoute = pathname.match(/^\/api\/characters\/([^/]+)\/actions\/([^/]+)$/);
    if (actionRoute) {
      const characterId = actionRoute[1];
      const actionId = actionRoute[2];
      if (request.method === "PATCH") {
        return await handleUpdateAction(request, response, characterId, actionId);
      }
      if (request.method === "DELETE") {
        return await handleDeleteAction(request, response, characterId, actionId);
      }
      return sendJson(response, 405, { message: "请求方法不支持。" });
    }

    const addActionRoute = pathname.match(/^\/api\/characters\/([^/]+)\/actions$/);
    if (addActionRoute) {
      if (request.method === "POST") {
        return await handleAddAction(request, response, addActionRoute[1]);
      }
      return sendJson(response, 405, { message: "请求方法不支持。" });
    }

    const characterRoute = pathname.match(/^\/api\/characters\/([^/]+)$/);
    if (characterRoute) {
      const characterId = characterRoute[1];
      if (request.method === "PATCH") {
        return await handleUpdateCharacter(request, response, characterId);
      }
      if (request.method === "DELETE") {
        return await handleDeleteCharacter(request, response, characterId);
      }
      return sendJson(response, 405, { message: "请求方法不支持。" });
    }

    if (request.method === "POST" && pathname === "/api/uploads") {
      return await handleUpload(request, response);
    }
    if (pathname.startsWith("/api/")) {
      return sendJson(response, 404, { message: "接口不存在。" });
    }

    if (["GET", "HEAD"].includes(request.method) && pathname.startsWith("/uploads/")) {
      const filename = path.basename(pathname.slice("/uploads/".length));
      if (!/^[\w-]+\.(avif|gif|jpe?g|png|webp)$/i.test(filename)) {
        return sendJson(response, 404, { message: "图片不存在。" });
      }
      try {
        return await sendFile(request, response, path.join(uploadDirectory, filename), "public, max-age=31536000, immutable");
      } catch (error) {
        if (error.code === "ENOENT") return sendJson(response, 404, { message: "图片不存在。" });
        throw error;
      }
    }

    if (["GET", "HEAD"].includes(request.method)) {
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const requestedPath = path.resolve(distDirectory, relativePath);
      const isInsideDist = requestedPath === distDirectory || requestedPath.startsWith(`${distDirectory}${path.sep}`);
      if (isInsideDist) {
        try {
          if (await sendFile(request, response, requestedPath)) return;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }

      // Only treat extension-less paths as SPA routes. Missing assets (for example
      // images) must return 404 instead of silently serving index.html.
      if (path.extname(relativePath)) {
        return sendJson(response, 404, { message: "资源不存在。" });
      }

      try {
        return await sendFile(request, response, path.join(distDirectory, "index.html"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }

    return sendJson(response, 404, { message: "资源不存在。" });
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error(error);
    return sendJson(response, error.statusCode || 500, {
      message: error.statusCode ? error.message : "服务器暂时无法处理该请求。",
    });
  }
};

export function startPosebookServer(listenPort = port) {
  const server = createServer(requestHandler);
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, host, () => {
      server.off("error", reject);
      console.log(`Posebook server listening on http://${host}:${listenPort}`);
      console.log(`Uploads stored in ${uploadDirectory}`);
      resolve(server);
    });
  });
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) await startPosebookServer();
