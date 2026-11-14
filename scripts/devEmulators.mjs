/**
 * Auth + Realtime Database emulator, seed dell'utente di prova, poi Vite.
 * Uso: npm run dev:emulators
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { seedEmulatorUser } from './seedEmulatorUser.mjs';

function emulatorJavaHome() {
  const root = 'C:\\Program Files\\Microsoft';
  if (!existsSync(root)) return process.env.JAVA_HOME || '';
  const jdks = readdirSync(root).filter((name) => name.startsWith('jdk-')).sort();
  const newest = jdks.at(-1);
  return newest ? join(root, newest) : (process.env.JAVA_HOME || '');
}

const project = 'demo-kentu-focus';

function waitForUrl(url) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        await fetch(url);
        resolve();
      } catch {
        if (Date.now() - started > 60000) reject(new Error(`emulatore non raggiungibile: ${url}`));
        else setTimeout(tick, 400);
      }
    };
    tick();
  });
}

function start(command, args, env = process.env) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    env,
    windowsHide: false,
  });
}

const javaHome = emulatorJavaHome();
const emulatorEnv = { ...process.env };
if (javaHome) {
  emulatorEnv.JAVA_HOME = javaHome;
  emulatorEnv.PATH = `${join(javaHome, 'bin')};${process.env.PATH || ''}`;
}

const realAi = process.env.VITE_EMULATOR_REAL_AI === '1';
if (realAi) {
  // Chiave solo da env / functions/.secret.local (gitignored). Mai un letterale nel repo.
  const secretFile = join(process.cwd(), 'functions', '.secret.local');
  if (!process.env.GEMINI_API_KEY && existsSync(secretFile)) {
    const fromFile = readFileSync(secretFile, 'utf8').trim();
    if (fromFile) process.env['GEMINI_API_KEY'] = fromFile;
  }
  emulatorEnv.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'emulator-placeholder';
}

const emulators = start('firebase', [
  'emulators:start',
  '--only',
  realAi ? 'auth,database,functions' : 'auth,database',
  '--project',
  project,
], emulatorEnv);

let vite = null;
let stopping = false;

function stopAll() {
  if (stopping) return;
  stopping = true;
  if (vite && !vite.killed) vite.kill();
  if (!emulators.killed) emulators.kill();
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
emulators.on('exit', (code) => {
  if (!stopping && code) process.exit(code);
});

try {
  await Promise.all([
    waitForUrl('http://127.0.0.1:9099/'),
    waitForUrl('http://127.0.0.1:9000/'),
  ]);
  await seedEmulatorUser();
} catch (error) {
  console.error(error?.message || error);
  stopAll();
  process.exit(1);
}

vite = start('npx', ['vite', '--port', '5173', '--strictPort'], {
  ...process.env,
  VITE_USE_FIREBASE_EMULATOR: '1',
});

vite.on('exit', (code) => {
  stopAll();
  process.exit(code ?? 0);
});
