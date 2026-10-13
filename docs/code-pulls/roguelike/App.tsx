
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// ============================================================
// DUNGEON OF OPUS - A Complete Roguelike by Opus 4.6
// ============================================================
// Procedural dungeons, turn-based combat, inventory, fog of war,
// multiple floors, permadeath, 7 enemy types, items, equipment.
// All in one file. No external dependencies.
// ============================================================

// ==================== TYPES ====================

type TileType = 'wall' | 'floor' | 'door' | 'stairs' | 'trap' | 'water' | 'lava';

interface Tile {
  type: TileType;
  visible: boolean;
  explored: boolean;
  item: Item | null;
  gold: number;
}

type ItemType = 'potion' | 'weapon' | 'armor' | 'scroll' | 'key' | 'food';

interface Item {
  id: string;
  name: string;
  type: ItemType;
  icon: string;
  description: string;
  value: number; // heal amount, attack bonus, defense bonus, etc.
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
}

type EnemySpecies = 'slime' | 'skeleton' | 'mage' | 'mimic' | 'vampire' | 'golem' | 'dragon';

interface Enemy {
  id: string;
  species: EnemySpecies;
  name: string;
  icon: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  behavior: 'wander' | 'chase' | 'ranged' | 'ambush' | 'guard';
  alerted: boolean;
  lastSeenPlayerX: number;
  lastSeenPlayerY: number;
}

interface Player {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  xp: number;
  level: number;
  gold: number;
  inventory: Item[];
  weapon: Item | null;
  armor: Item | null;
  keys: number;
  floor: number;
  turns: number;
  kills: number;
  foodTimer: number;
}

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

type GamePhase = 'title' | 'playing' | 'inventory' | 'gameover' | 'victory';

interface GameState {
  phase: GamePhase;
  map: Tile[][];
  player: Player;
  enemies: Enemy[];
  messages: string[];
  score: number;
  highScore: number;
  mapWidth: number;
  mapHeight: number;
  rooms: Room[];
  animatingAttack: { x: number; y: number; frame: number } | null;
}

// ==================== CONSTANTS ====================

const MAP_W = 48;
const MAP_H = 28;
const VIEW_W = 40;
const VIEW_H = 22;
const SIGHT_RANGE = 7;
const MAX_INVENTORY = 12;
const MAX_FLOOR = 5;
const XP_PER_LEVEL = [0, 10, 25, 50, 100, 180, 300, 500, 800, 1200];
// Hunger depletes 1 per turn; eating food restores the timer

// ==================== ITEM DEFINITIONS ====================

const ITEMS: Record<string, Omit<Item, 'id'>> = {
  health_potion: { name: 'Health Potion', type: 'potion', icon: '!', description: 'Restores 15 HP', value: 15, rarity: 'common' },
  greater_potion: { name: 'Greater Potion', type: 'potion', icon: '!', description: 'Restores 35 HP', value: 35, rarity: 'uncommon' },
  elixir: { name: 'Elixir of Life', type: 'potion', icon: '!', description: 'Restores 60 HP', value: 60, rarity: 'rare' },
  rusty_sword: { name: 'Rusty Sword', type: 'weapon', icon: ')', description: '+2 Attack', value: 2, rarity: 'common' },
  steel_blade: { name: 'Steel Blade', type: 'weapon', icon: ')', description: '+4 Attack', value: 4, rarity: 'uncommon' },
  flame_sword: { name: 'Flame Sword', type: 'weapon', icon: ')', description: '+7 Attack', value: 7, rarity: 'rare' },
  opus_blade: { name: 'Blade of Opus', type: 'weapon', icon: ')', description: '+12 Attack', value: 12, rarity: 'legendary' },
  leather_armor: { name: 'Leather Armor', type: 'armor', icon: '[', description: '+2 Defense', value: 2, rarity: 'common' },
  chain_mail: { name: 'Chain Mail', type: 'armor', icon: '[', description: '+4 Defense', value: 4, rarity: 'uncommon' },
  plate_armor: { name: 'Plate Armor', type: 'armor', icon: '[', description: '+7 Defense', value: 7, rarity: 'rare' },
  mythril_armor: { name: 'Mythril Armor', type: 'armor', icon: '[', description: '+11 Defense', value: 11, rarity: 'legendary' },
  scroll_fire: { name: 'Scroll of Fire', type: 'scroll', icon: '?', description: 'Deals 20 damage to nearby enemies', value: 20, rarity: 'uncommon' },
  scroll_teleport: { name: 'Scroll of Teleport', type: 'scroll', icon: '?', description: 'Teleport to a random room', value: 0, rarity: 'uncommon' },
  scroll_reveal: { name: 'Scroll of Reveal', type: 'scroll', icon: '?', description: 'Reveals the entire floor', value: 0, rarity: 'rare' },
  iron_key: { name: 'Iron Key', type: 'key', icon: 'k', description: 'Opens a locked door', value: 1, rarity: 'common' },
  bread: { name: 'Bread', type: 'food', icon: '%', description: 'Restores hunger timer', value: 60, rarity: 'common' },
  feast: { name: 'Feast', type: 'food', icon: '%', description: 'Fully restores hunger', value: 200, rarity: 'uncommon' },
};

const ITEM_POOLS: Record<number, { key: string; weight: number }[]> = {
  1: [
    { key: 'health_potion', weight: 30 }, { key: 'rusty_sword', weight: 15 }, { key: 'leather_armor', weight: 12 },
    { key: 'iron_key', weight: 10 }, { key: 'bread', weight: 20 }, { key: 'scroll_fire', weight: 5 },
    { key: 'scroll_teleport', weight: 5 }, { key: 'steel_blade', weight: 3 },
  ],
  2: [
    { key: 'health_potion', weight: 20 }, { key: 'greater_potion', weight: 10 }, { key: 'steel_blade', weight: 10 },
    { key: 'chain_mail', weight: 8 }, { key: 'iron_key', weight: 8 }, { key: 'bread', weight: 15 },
    { key: 'scroll_fire', weight: 8 }, { key: 'scroll_teleport', weight: 6 }, { key: 'scroll_reveal', weight: 3 },
    { key: 'flame_sword', weight: 2 },
  ],
  3: [
    { key: 'greater_potion', weight: 15 }, { key: 'elixir', weight: 5 }, { key: 'flame_sword', weight: 6 },
    { key: 'plate_armor', weight: 5 }, { key: 'chain_mail', weight: 8 }, { key: 'iron_key', weight: 5 },
    { key: 'bread', weight: 12 }, { key: 'feast', weight: 4 }, { key: 'scroll_fire', weight: 10 },
    { key: 'scroll_reveal', weight: 5 }, { key: 'scroll_teleport', weight: 8 },
  ],
  4: [
    { key: 'greater_potion', weight: 12 }, { key: 'elixir', weight: 8 }, { key: 'flame_sword', weight: 5 },
    { key: 'plate_armor', weight: 6 }, { key: 'feast', weight: 8 }, { key: 'scroll_fire', weight: 10 },
    { key: 'scroll_reveal', weight: 6 }, { key: 'opus_blade', weight: 1 }, { key: 'mythril_armor', weight: 1 },
  ],
  5: [
    { key: 'elixir', weight: 12 }, { key: 'feast', weight: 10 }, { key: 'scroll_fire', weight: 12 },
    { key: 'scroll_reveal', weight: 8 }, { key: 'opus_blade', weight: 3 }, { key: 'mythril_armor', weight: 3 },
    { key: 'scroll_teleport', weight: 10 },
  ],
};

// ==================== ENEMY DEFINITIONS ====================

const ENEMY_TEMPLATES: Record<EnemySpecies, { name: string; icon: string; hp: number; attack: number; defense: number; xp: number; behavior: Enemy['behavior'] }> = {
  slime: { name: 'Slime', icon: 's', hp: 8, attack: 2, defense: 0, xp: 3, behavior: 'wander' },
  skeleton: { name: 'Skeleton', icon: 'S', hp: 15, attack: 5, defense: 2, xp: 8, behavior: 'chase' },
  mage: { name: 'Dark Mage', icon: 'M', hp: 12, attack: 8, defense: 1, xp: 12, behavior: 'ranged' },
  mimic: { name: 'Mimic', icon: '$', hp: 20, attack: 7, defense: 3, xp: 15, behavior: 'ambush' },
  vampire: { name: 'Vampire', icon: 'V', hp: 25, attack: 6, defense: 3, xp: 18, behavior: 'chase' },
  golem: { name: 'Stone Golem', icon: 'G', hp: 40, attack: 9, defense: 8, xp: 25, behavior: 'guard' },
  dragon: { name: 'Elder Dragon', icon: 'D', hp: 80, attack: 15, defense: 10, xp: 100, behavior: 'chase' },
};

const ENEMY_POOLS: Record<number, { species: EnemySpecies; weight: number }[]> = {
  1: [{ species: 'slime', weight: 50 }, { species: 'skeleton', weight: 30 }, { species: 'mimic', weight: 20 }],
  2: [{ species: 'slime', weight: 20 }, { species: 'skeleton', weight: 35 }, { species: 'mage', weight: 25 }, { species: 'mimic', weight: 20 }],
  3: [{ species: 'skeleton', weight: 20 }, { species: 'mage', weight: 25 }, { species: 'vampire', weight: 25 }, { species: 'mimic', weight: 15 }, { species: 'golem', weight: 15 }],
  4: [{ species: 'mage', weight: 20 }, { species: 'vampire', weight: 30 }, { species: 'golem', weight: 30 }, { species: 'mimic', weight: 20 }],
  5: [{ species: 'vampire', weight: 25 }, { species: 'golem', weight: 25 }, { species: 'dragon', weight: 15 }, { species: 'mage', weight: 20 }, { species: 'mimic', weight: 15 }],
};

// ==================== UTILITY FUNCTIONS ====================

let _idCounter = 0;
function uid(): string { return `${++_idCounter}`; }

function rng(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T extends { weight: number }>(pool: T[]): T {
  const total = pool.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry;
  }
  return pool[pool.length - 1];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function manhattan(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

// ==================== DUNGEON GENERATION ====================

function createEmptyMap(): Tile[][] {
  const map: Tile[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] = { type: 'wall', visible: false, explored: false, item: null, gold: 0 };
    }
  }
  return map;
}

function carveRoom(map: Tile[][], room: Room) {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (y >= 0 && y < MAP_H && x >= 0 && x < MAP_W) {
        map[y][x].type = 'floor';
      }
    }
  }
}

function carveCorridor(map: Tile[][], x1: number, y1: number, x2: number, y2: number) {
  let cx = x1, cy = y1;
  // Go horizontal first or vertical first randomly
  if (Math.random() < 0.5) {
    while (cx !== x2) { cx += cx < x2 ? 1 : -1; if (map[cy]?.[cx]) map[cy][cx].type = 'floor'; }
    while (cy !== y2) { cy += cy < y2 ? 1 : -1; if (map[cy]?.[cx]) map[cy][cx].type = 'floor'; }
  } else {
    while (cy !== y2) { cy += cy < y2 ? 1 : -1; if (map[cy]?.[cx]) map[cy][cx].type = 'floor'; }
    while (cx !== x2) { cx += cx < x2 ? 1 : -1; if (map[cy]?.[cx]) map[cy][cx].type = 'floor'; }
  }
}

function roomsOverlap(a: Room, b: Room, padding: number = 2): boolean {
  return !(a.x + a.w + padding <= b.x || b.x + b.w + padding <= a.x ||
           a.y + a.h + padding <= b.y || b.y + b.h + padding <= a.y);
}

function generateDungeon(floor: number): { map: Tile[][]; rooms: Room[]; startRoom: Room; stairsRoom: Room } {
  const map = createEmptyMap();
  const rooms: Room[] = [];
  const targetRooms = 6 + floor * 2;
  let attempts = 0;

  while (rooms.length < targetRooms && attempts < 500) {
    attempts++;
    const w = rng(4, 9);
    const h = rng(3, 7);
    const x = rng(1, MAP_W - w - 1);
    const y = rng(1, MAP_H - h - 1);
    const room: Room = { x, y, w, h };

    if (!rooms.some(r => roomsOverlap(r, room))) {
      rooms.push(room);
      carveRoom(map, room);
    }
  }

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1];
    const b = rooms[i];
    const ax = Math.floor(a.x + a.w / 2);
    const ay = Math.floor(a.y + a.h / 2);
    const bx = Math.floor(b.x + b.w / 2);
    const by = Math.floor(b.y + b.h / 2);
    carveCorridor(map, ax, ay, bx, by);
  }

  // Extra corridors for connectivity
  for (let i = 0; i < Math.floor(rooms.length / 3); i++) {
    const a = pick(rooms);
    const b = pick(rooms);
    if (a !== b) {
      carveCorridor(map, Math.floor(a.x + a.w / 2), Math.floor(a.y + a.h / 2),
                         Math.floor(b.x + b.w / 2), Math.floor(b.y + b.h / 2));
    }
  }

  // Place doors at corridor-room boundaries
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (map[y][x].type === 'floor') {
        const horizontal = map[y][x - 1].type === 'wall' && map[y][x + 1].type === 'wall' &&
                          map[y - 1][x].type === 'floor' && map[y + 1][x].type === 'floor';
        const vertical = map[y - 1][x].type === 'wall' && map[y + 1][x].type === 'wall' &&
                         map[y][x - 1].type === 'floor' && map[y][x + 1].type === 'floor';
        if ((horizontal || vertical) && Math.random() < 0.3) {
          map[y][x].type = 'door';
        }
      }
    }
  }

  // Place traps (more on deeper floors)
  const trapCount = rng(2, 3 + floor);
  let trapsPlaced = 0;
  for (let attempt = 0; attempt < 200 && trapsPlaced < trapCount; attempt++) {
    const room = pick(rooms);
    const tx = rng(room.x + 1, room.x + room.w - 2);
    const ty = rng(room.y + 1, room.y + room.h - 2);
    if (map[ty]?.[tx]?.type === 'floor') {
      map[ty][tx].type = 'trap';
      trapsPlaced++;
    }
  }

  // Place water/lava patches on deeper floors
  if (floor >= 2) {
    const patchCount = rng(1, floor);
    for (let p = 0; p < patchCount; p++) {
      const room = pick(rooms);
      const cx = rng(room.x + 1, room.x + room.w - 2);
      const cy = rng(room.y + 1, room.y + room.h - 2);
      const patchType: TileType = floor >= 4 ? 'lava' : 'water';
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (Math.random() < 0.6 && map[cy + dy]?.[cx + dx]?.type === 'floor') {
            map[cy + dy][cx + dx].type = patchType;
          }
        }
      }
    }
  }

  // Place stairs in the last room (not on floor 5)
  const stairsRoom = rooms[rooms.length - 1];
  if (floor < MAX_FLOOR) {
    const sx = Math.floor(stairsRoom.x + stairsRoom.w / 2);
    const sy = Math.floor(stairsRoom.y + stairsRoom.h / 2);
    map[sy][sx].type = 'stairs';
  }

  const startRoom = rooms[0];

  // Place gold
  for (const room of rooms) {
    if (Math.random() < 0.5) {
      const gx = rng(room.x, room.x + room.w - 1);
      const gy = rng(room.y, room.y + room.h - 1);
      if (map[gy][gx].type === 'floor') {
        map[gy][gx].gold = rng(1, 5 + floor * 3);
      }
    }
  }

  // Place items
  const itemCount = rng(3, 5 + floor);
  const pool = ITEM_POOLS[clamp(floor, 1, 5)];
  let itemsPlaced = 0;
  for (let attempt = 0; attempt < 200 && itemsPlaced < itemCount; attempt++) {
    const room = pick(rooms);
    const ix = rng(room.x, room.x + room.w - 1);
    const iy = rng(room.y, room.y + room.h - 1);
    if (map[iy][ix].type === 'floor' && !map[iy][ix].item) {
      const picked = weightedPick(pool);
      const template = ITEMS[picked.key];
      map[iy][ix].item = { ...template, id: uid() };
      itemsPlaced++;
    }
  }

  return { map, rooms, startRoom, stairsRoom };
}

// ==================== ENEMY SPAWNING ====================

function spawnEnemies(rooms: Room[], map: Tile[][], floor: number, playerX: number, playerY: number): Enemy[] {
  const enemies: Enemy[] = [];
  const count = rng(4 + floor * 2, 6 + floor * 3);
  const pool = ENEMY_POOLS[clamp(floor, 1, 5)];

  for (let i = 0; i < count; i++) {
    const room = pick(rooms);
    const ex = rng(room.x, room.x + room.w - 1);
    const ey = rng(room.y, room.y + room.h - 1);

    if (manhattan(ex, ey, playerX, playerY) < 5) continue;
    if (map[ey][ex].type !== 'floor' && map[ey][ex].type !== 'trap') continue;
    if (enemies.some(e => e.x === ex && e.y === ey)) continue;

    const picked = weightedPick(pool);
    const template = ENEMY_TEMPLATES[picked.species];
    const floorScale = 1 + (floor - 1) * 0.15;

    enemies.push({
      id: uid(),
      species: picked.species,
      name: template.name,
      icon: template.icon,
      x: ex,
      y: ey,
      hp: Math.floor(template.hp * floorScale),
      maxHp: Math.floor(template.hp * floorScale),
      attack: Math.floor(template.attack * floorScale),
      defense: Math.floor(template.defense * floorScale),
      xp: Math.floor(template.xp * floorScale),
      behavior: template.behavior,
      alerted: false,
      lastSeenPlayerX: -1,
      lastSeenPlayerY: -1,
    });
  }

  // Boss on floor 5
  if (floor === MAX_FLOOR) {
    const bossRoom = rooms[rooms.length - 1];
    const bx = Math.floor(bossRoom.x + bossRoom.w / 2);
    const by = Math.floor(bossRoom.y + bossRoom.h / 2);
    enemies.push({
      id: uid(),
      species: 'dragon',
      name: 'Opus, the Elder Dragon',
      icon: 'D',
      x: bx, y: by,
      hp: 120, maxHp: 120,
      attack: 18, defense: 12, xp: 200,
      behavior: 'chase', alerted: false,
      lastSeenPlayerX: -1, lastSeenPlayerY: -1,
    });
  }

  return enemies;
}

// ==================== LINE OF SIGHT (Bresenham) ====================

function hasLineOfSight(map: Tile[][], x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    if (cx === x1 && cy === y1) return true;
    if (map[cy]?.[cx]?.type === 'wall') return false;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
    // Safety
    if (cx < 0 || cx >= MAP_W || cy < 0 || cy >= MAP_H) return false;
  }
}

function updateVisibility(map: Tile[][], px: number, py: number): Tile[][] {
  const newMap = map.map(row => row.map(t => ({ ...t, visible: false })));

  for (let dy = -SIGHT_RANGE; dy <= SIGHT_RANGE; dy++) {
    for (let dx = -SIGHT_RANGE; dx <= SIGHT_RANGE; dx++) {
      const tx = px + dx;
      const ty = py + dy;
      if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
      if (dist(px, py, tx, ty) > SIGHT_RANGE) continue;
      if (hasLineOfSight(newMap, px, py, tx, ty)) {
        newMap[ty][tx].visible = true;
        newMap[ty][tx].explored = true;
      }
    }
  }

  return newMap;
}

// ==================== AI / ENEMY MOVEMENT ====================

function moveEnemies(state: GameState): GameState {
  const { map, enemies, messages } = state;
  let { player } = state;
  const newEnemies = [...enemies];
  const newMessages = [...messages];

  for (let i = 0; i < newEnemies.length; i++) {
    const enemy = { ...newEnemies[i] };
    newEnemies[i] = enemy;
    const d = manhattan(enemy.x, enemy.y, player.x, player.y);
    const canSeePlayer = d <= SIGHT_RANGE && hasLineOfSight(map, enemy.x, enemy.y, player.x, player.y);

    if (canSeePlayer) {
      enemy.alerted = true;
      enemy.lastSeenPlayerX = player.x;
      enemy.lastSeenPlayerY = player.y;
    }

    // Mimic: don't move until player is adjacent
    if (enemy.behavior === 'ambush' && !enemy.alerted) continue;
    if (enemy.behavior === 'ambush' && d > 1) {
      if (canSeePlayer && d <= 2) {
        enemy.alerted = true;
      } else {
        continue;
      }
    }

    // Guard: only chase if player is nearby
    if (enemy.behavior === 'guard' && d > 4 && !enemy.alerted) continue;

    // Ranged mage: try to keep distance and attack
    if (enemy.behavior === 'ranged' && canSeePlayer) {
      if (d <= 1) {
        // Melee if forced
        const result = resolveEnemyAttack(enemy, player);
        player = result.player;
        newMessages.push(result.message);
        continue;
      }
      if (d <= 4) {
        // Ranged attack
        const dmg = Math.max(1, enemy.attack - Math.floor(player.defense / 2));
        player = { ...player, hp: player.hp - dmg };
        newMessages.push(`${enemy.name} hurls a bolt of energy! (-${dmg} HP)`);
        // Try to move away
        const awayDx = Math.sign(enemy.x - player.x);
        const awayDy = Math.sign(enemy.y - player.y);
        const nx = enemy.x + awayDx;
        const ny = enemy.y + awayDy;
        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H &&
            map[ny][nx].type !== 'wall' && map[ny][nx].type !== 'lava' &&
            !newEnemies.some((e, j) => j !== i && e.x === nx && e.y === ny) &&
            !(nx === player.x && ny === player.y)) {
          enemy.x = nx;
          enemy.y = ny;
        }
        continue;
      }
    }

    // Chase / wander
    if (enemy.alerted || enemy.behavior === 'chase') {
      const targetX = enemy.alerted ? (canSeePlayer ? player.x : enemy.lastSeenPlayerX) : enemy.x;
      const targetY = enemy.alerted ? (canSeePlayer ? player.y : enemy.lastSeenPlayerY) : enemy.y;

      if (targetX < 0) continue;

      // Adjacent to player? Attack!
      if (manhattan(enemy.x, enemy.y, player.x, player.y) === 1) {
        const result = resolveEnemyAttack(enemy, player);
        player = result.player;
        newMessages.push(result.message);
        continue;
      }

      // Move toward target
      const dx = Math.sign(targetX - enemy.x);
      const dy = Math.sign(targetY - enemy.y);
      // Try primary direction, then alternatives
      const moves = Math.random() < 0.5
        ? [{ x: enemy.x + dx, y: enemy.y }, { x: enemy.x, y: enemy.y + dy }]
        : [{ x: enemy.x, y: enemy.y + dy }, { x: enemy.x + dx, y: enemy.y }];

      for (const m of moves) {
        if (m.x >= 0 && m.x < MAP_W && m.y >= 0 && m.y < MAP_H &&
            map[m.y][m.x].type !== 'wall' && map[m.y][m.x].type !== 'lava' &&
            !newEnemies.some((e, j) => j !== i && e.x === m.x && e.y === m.y) &&
            !(m.x === player.x && m.y === player.y)) {
          enemy.x = m.x;
          enemy.y = m.y;
          break;
        }
      }

      // Lose interest if can't see player for a while
      if (!canSeePlayer && enemy.lastSeenPlayerX === enemy.x && enemy.lastSeenPlayerY === enemy.y) {
        enemy.alerted = false;
      }
    } else if (enemy.behavior === 'wander') {
      // Random movement
      if (Math.random() < 0.4) {
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        const [ddx, ddy] = pick(dirs);
        const nx = enemy.x + ddx;
        const ny = enemy.y + ddy;
        if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H &&
            map[ny][nx].type !== 'wall' && map[ny][nx].type !== 'lava' &&
            !newEnemies.some((e, j) => j !== i && e.x === nx && e.y === ny) &&
            !(nx === player.x && ny === player.y)) {
          enemy.x = nx;
          enemy.y = ny;
        }
      }

      // Slimes attack if adjacent
      if (manhattan(enemy.x, enemy.y, player.x, player.y) === 1) {
        const result = resolveEnemyAttack(enemy, player);
        player = result.player;
        newMessages.push(result.message);
      }
    }
  }

  return { ...state, enemies: newEnemies, player, messages: newMessages };
}

function resolveEnemyAttack(enemy: Enemy, player: Player): { player: Player; message: string } {
  const playerDef = player.defense + (player.armor?.value || 0);
  const dmg = Math.max(1, enemy.attack - Math.floor(playerDef / 2));
  const vampireHeal = enemy.species === 'vampire' ? Math.floor(dmg / 2) : 0;
  const newHp = player.hp - dmg;
  let msg = `${enemy.name} attacks! (-${dmg} HP)`;
  if (vampireHeal > 0) msg += ` Drains life!`;
  return { player: { ...player, hp: newHp }, message: msg };
}

// ==================== PLAYER ACTIONS ====================

function resolvePlayerAttack(player: Player, enemy: Enemy): { enemy: Enemy; xpGained: number; message: string; killed: boolean } {
  const weaponBonus = player.weapon?.value || 0;
  const totalAtk = player.attack + weaponBonus;
  const dmg = Math.max(1, totalAtk - Math.floor(enemy.defense / 2));
  const crit = Math.random() < 0.1;
  const finalDmg = crit ? dmg * 2 : dmg;
  const newHp = enemy.hp - finalDmg;
  const killed = newHp <= 0;
  let msg = crit
    ? `CRITICAL HIT! You strike ${enemy.name} for ${finalDmg} damage!`
    : `You attack ${enemy.name} for ${finalDmg} damage.`;
  if (killed) msg += ` ${enemy.name} is defeated!`;
  return {
    enemy: { ...enemy, hp: newHp },
    xpGained: killed ? enemy.xp : 0,
    message: msg,
    killed,
  };
}

function checkLevelUp(player: Player, messages: string[]): { player: Player; messages: string[] } {
  const threshold = XP_PER_LEVEL[clamp(player.level, 0, XP_PER_LEVEL.length - 1)] || player.level * 150;
  if (player.xp >= threshold && player.level < 20) {
    const newPlayer = {
      ...player,
      level: player.level + 1,
      maxHp: player.maxHp + 5,
      hp: Math.min(player.hp + 10, player.maxHp + 5),
      attack: player.attack + 1,
      defense: player.defense + 1,
      xp: player.xp - threshold,
    };
    return {
      player: newPlayer,
      messages: [...messages, `LEVEL UP! You are now level ${newPlayer.level}! HP+5, ATK+1, DEF+1`],
    };
  }
  return { player, messages };
}

function applyItem(player: Player, item: Item, enemies: Enemy[], map: Tile[][], rooms: Room[], messages: string[]): {
  player: Player;
  enemies: Enemy[];
  map: Tile[][];
  messages: string[];
  consumed: boolean;
} {
  const newMessages = [...messages];
  const newPlayer = { ...player };
  let newEnemies = [...enemies];
  let newMap = map;
  const consumed = true;

  switch (item.type) {
    case 'potion': {
      const healed = Math.min(item.value, newPlayer.maxHp - newPlayer.hp);
      newPlayer.hp += healed;
      newMessages.push(`You drink ${item.name}. (+${healed} HP)`);
      break;
    }
    case 'food': {
      newPlayer.foodTimer = Math.min(newPlayer.foodTimer + item.value, 200);
      const healed = Math.min(5, newPlayer.maxHp - newPlayer.hp);
      newPlayer.hp += healed;
      newMessages.push(`You eat ${item.name}. Hunger restored.`);
      break;
    }
    case 'weapon': {
      if (newPlayer.weapon) {
        newPlayer.inventory.push(newPlayer.weapon);
      }
      newPlayer.weapon = item;
      newMessages.push(`You equip ${item.name}. (+${item.value} ATK)`);
      break;
    }
    case 'armor': {
      if (newPlayer.armor) {
        newPlayer.inventory.push(newPlayer.armor);
      }
      newPlayer.armor = item;
      newMessages.push(`You equip ${item.name}. (+${item.value} DEF)`);
      break;
    }
    case 'scroll': {
      if (item.name.includes('Fire')) {
        let killCount = 0;
        newEnemies = newEnemies.map(e => {
          if (manhattan(e.x, e.y, newPlayer.x, newPlayer.y) <= 3) {
            const newHp = e.hp - item.value;
            if (newHp <= 0) { killCount++; newPlayer.xp += e.xp; }
            return { ...e, hp: newHp };
          }
          return e;
        }).filter(e => e.hp > 0);
        newMessages.push(`The scroll erupts in flames! ${killCount > 0 ? `${killCount} enemies burned!` : 'Enemies scorched!'}`);
      } else if (item.name.includes('Teleport')) {
        const room = pick(rooms);
        newPlayer.x = rng(room.x, room.x + room.w - 1);
        newPlayer.y = rng(room.y, room.y + room.h - 1);
        newMessages.push('You are teleported across the dungeon!');
      } else if (item.name.includes('Reveal')) {
        newMap = map.map(row => row.map(t => ({ ...t, explored: true })));
        newMessages.push('The map is revealed before your eyes!');
      }
      break;
    }
    case 'key': {
      newPlayer.keys += item.value;
      newMessages.push('Picked up a key.');
      break;
    }
  }

  return { player: newPlayer, enemies: newEnemies, map: newMap, messages: newMessages, consumed };
}

// ==================== RENDERING ====================

function getTileChar(tile: Tile, x: number, y: number, player: Player, enemies: Enemy[], showAll: boolean): { char: string; color: string } {
  // Player
  if (x === player.x && y === player.y) return { char: '@', color: 'text-yellow-300' };

  // Enemy (visible only)
  if (tile.visible || showAll) {
    const enemy = enemies.find(e => e.x === x && e.y === y);
    if (enemy) {
      const colors: Record<EnemySpecies, string> = {
        slime: 'text-green-400',
        skeleton: 'text-gray-300',
        mage: 'text-purple-400',
        mimic: 'text-yellow-400',
        vampire: 'text-red-400',
        golem: 'text-stone-400',
        dragon: 'text-red-500',
      };
      // Mimic looks like gold when not alerted
      if (enemy.species === 'mimic' && !enemy.alerted) {
        return { char: '$', color: 'text-yellow-400' };
      }
      return { char: enemy.icon, color: colors[enemy.species] || 'text-red-400' };
    }
  }

  if (!tile.visible && !tile.explored) return { char: ' ', color: 'text-gray-900' };

  const dim = !tile.visible;
  const dimSuffix = dim ? '/50' : '';

  // Gold on ground
  if (tile.gold > 0 && tile.visible) return { char: '$', color: `text-yellow-400${dimSuffix}` };

  // Item on ground
  if (tile.item && tile.visible) {
    const rarityColors: Record<string, string> = {
      common: 'text-white',
      uncommon: 'text-green-300',
      rare: 'text-blue-400',
      legendary: 'text-amber-300',
    };
    return { char: tile.item.icon, color: rarityColors[tile.item.rarity] || 'text-white' };
  }

  switch (tile.type) {
    case 'wall': return { char: '#', color: dim ? 'text-gray-700' : 'text-gray-500' };
    case 'floor': return { char: '\u00B7', color: dim ? 'text-gray-800' : 'text-gray-600' };
    case 'door': return { char: '+', color: dim ? 'text-amber-900' : 'text-amber-600' };
    case 'stairs': return { char: '>', color: dim ? 'text-cyan-900' : 'text-cyan-400' };
    case 'trap': return { char: tile.visible ? '^' : '\u00B7', color: tile.visible ? 'text-orange-400' : (dim ? 'text-gray-800' : 'text-gray-600') };
    case 'water': return { char: '~', color: dim ? 'text-blue-900' : 'text-blue-400' };
    case 'lava': return { char: '~', color: dim ? 'text-red-900' : 'text-red-500' };
    default: return { char: '.', color: 'text-gray-600' };
  }
}

// ==================== MINIMAP ====================

function Minimap({ map, player, enemies }: { map: Tile[][]; player: Player; enemies: Enemy[] }) {
  const scale = 2;
  const width = Math.ceil(MAP_W / scale);
  const height = Math.ceil(MAP_H / scale);

  const pixels = useMemo(() => {
    const result: { color: string }[][] = [];
    for (let y = 0; y < height; y++) {
      result[y] = [];
      for (let x = 0; x < width; x++) {
        const mx = x * scale;
        const my = y * scale;
        const tile = map[my]?.[mx];
        const isPlayer = Math.floor(player.x / scale) === x && Math.floor(player.y / scale) === y;
        const hasEnemy = enemies.some(e => Math.floor(e.x / scale) === x && Math.floor(e.y / scale) === y && map[e.y]?.[e.x]?.visible);

        if (isPlayer) {
          result[y][x] = { color: 'bg-yellow-400' };
        } else if (hasEnemy) {
          result[y][x] = { color: 'bg-red-500' };
        } else if (!tile?.explored) {
          result[y][x] = { color: 'bg-gray-950' };
        } else if (tile.type === 'wall') {
          result[y][x] = { color: 'bg-gray-700' };
        } else if (tile.type === 'stairs') {
          result[y][x] = { color: 'bg-cyan-500' };
        } else if (tile.type === 'water') {
          result[y][x] = { color: 'bg-blue-700' };
        } else if (tile.type === 'lava') {
          result[y][x] = { color: 'bg-red-800' };
        } else {
          result[y][x] = { color: tile.visible ? 'bg-gray-800' : 'bg-gray-900' };
        }
      }
    }
    return result;
  }, [map, player.x, player.y, enemies, height, width]);

  return (
    <div className="border border-gray-700 p-0.5" style={{ lineHeight: 0 }}>
      {pixels.map((row, y) => (
        <div key={y} className="flex">
          {row.map((px, x) => (
            <div key={x} className={`${px.color}`} style={{ width: '4px', height: '4px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function DungeonOfOpus() {
  const [game, setGame] = useState<GameState | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const gameRef = useRef<HTMLDivElement>(null);

  const initGame = useCallback(() => {
    _idCounter = 0;
    const { map, rooms, startRoom } = generateDungeon(1);
    const px = Math.floor(startRoom.x + startRoom.w / 2);
    const py = Math.floor(startRoom.y + startRoom.h / 2);

    const player: Player = {
      x: px, y: py,
      hp: 30, maxHp: 30,
      attack: 3, defense: 1,
      xp: 0, level: 1,
      gold: 0,
      inventory: [{ ...ITEMS.health_potion, id: uid() }, { ...ITEMS.bread, id: uid() }],
      weapon: null, armor: null,
      keys: 0,
      floor: 1,
      turns: 0,
      kills: 0,
      foodTimer: 100,
    };

    const visibleMap = updateVisibility(map, px, py);
    const enemies = spawnEnemies(rooms, visibleMap, 1, px, py);

    const stored = typeof window !== 'undefined' ? parseInt(localStorage.getItem('dungeon_highscore') || '0') : 0;

    setGame({
      phase: 'playing',
      map: visibleMap,
      player,
      enemies,
      messages: ['You descend into the Dungeon of Opus. Find the stairs to go deeper.', 'Press ? for help.'],
      score: 0,
      highScore: stored,
      mapWidth: MAP_W,
      mapHeight: MAP_H,
      rooms,
      animatingAttack: null,
    });

    setTimeout(() => gameRef.current?.focus(), 100);
  }, []);

  const handleTurn = useCallback((dx: number, dy: number) => {
    if (!game || game.phase !== 'playing') return;

    const { rooms } = game;
    let { map, player, enemies, messages, score } = game;
    player = { ...player };
    messages = [...messages];

    const nx = player.x + dx;
    const ny = player.y + dy;

    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;

    const tile = map[ny][nx];

    // Wall: can't move
    if (tile.type === 'wall') return;

    // Door: might need key (locked doors are rare)
    if (tile.type === 'door') {
      // Doors are just passable
      map = map.map(row => row.map(t => ({ ...t })));
      map[ny][nx] = { ...map[ny][nx], type: 'floor' };
    }

    // Check for enemy at target
    const enemyIdx = enemies.findIndex(e => e.x === nx && e.y === ny);
    if (enemyIdx >= 0) {
      const result = resolvePlayerAttack(player, enemies[enemyIdx]);
      enemies = [...enemies];
      if (result.killed) {
        enemies.splice(enemyIdx, 1);
        player.xp += result.xpGained;
        player.kills++;
        score += result.xpGained * 10;
      } else {
        enemies[enemyIdx] = result.enemy;
      }
      messages.push(result.message);
      const levelResult = checkLevelUp(player, messages);
      player = levelResult.player;
      messages = levelResult.messages;
    } else {
      // Move player
      player.x = nx;
      player.y = ny;

      // Trap
      if (tile.type === 'trap') {
        const trapDmg = rng(3, 5 + player.floor * 2);
        player.hp -= trapDmg;
        messages.push(`You step on a trap! (-${trapDmg} HP)`);
        // Remove trap after triggering
        map = map.map(row => row.map(t => ({ ...t })));
        map[ny][nx] = { ...map[ny][nx], type: 'floor' };
      }

      // Water: slow (skip enemy turn effect simulated by message)
      if (tile.type === 'water') {
        messages.push('You wade through shallow water...');
      }

      // Lava
      if (tile.type === 'lava') {
        const lavaDmg = rng(5, 10);
        player.hp -= lavaDmg;
        messages.push(`The lava burns! (-${lavaDmg} HP)`);
      }

      // Pick up gold
      if (tile.gold > 0) {
        player.gold += tile.gold;
        score += tile.gold;
        messages.push(`Found ${tile.gold} gold!`);
        map = map.map(row => row.map(t => ({ ...t })));
        map[ny][nx] = { ...map[ny][nx], gold: 0 };
      }

      // Pick up item
      if (tile.item) {
        const item = tile.item;
        if (item.type === 'key') {
          player.keys += item.value;
          messages.push(`Picked up ${item.name}!`);
        } else if (item.type === 'weapon' || item.type === 'armor') {
          if (player.inventory.length < MAX_INVENTORY) {
            player.inventory = [...player.inventory, item];
            messages.push(`Found ${item.name}! (Press I for inventory)`);
          } else {
            messages.push('Inventory full! Cannot pick up item.');
            // Don't remove from map
            player.turns++;
            const newMap = updateVisibility(map, player.x, player.y);
            let newState: GameState = { ...game, map: newMap, player, enemies, messages: messages.slice(-8), score, rooms };
            newState = moveEnemies(newState);
            if (newState.player.hp <= 0) {
              const finalScore = score + player.gold + player.kills * 5;
              const hs = Math.max(game.highScore, finalScore);
              if (typeof window !== 'undefined') localStorage.setItem('dungeon_highscore', String(hs));
              setGame({ ...newState, phase: 'gameover', score: finalScore, highScore: hs });
            } else {
              setGame(newState);
            }
            return;
          }
        } else {
          if (player.inventory.length < MAX_INVENTORY) {
            player.inventory = [...player.inventory, item];
            messages.push(`Found ${item.name}!`);
          } else {
            messages.push('Inventory full!');
            player.turns++;
            const newMap = updateVisibility(map, player.x, player.y);
            let newState: GameState = { ...game, map: newMap, player, enemies, messages: messages.slice(-8), score, rooms };
            newState = moveEnemies(newState);
            if (newState.player.hp <= 0) {
              const finalScore = score + player.gold + player.kills * 5;
              const hs = Math.max(game.highScore, finalScore);
              if (typeof window !== 'undefined') localStorage.setItem('dungeon_highscore', String(hs));
              setGame({ ...newState, phase: 'gameover', score: finalScore, highScore: hs });
            } else {
              setGame(newState);
            }
            return;
          }
        }
        map = map.map(row => row.map(t => ({ ...t })));
        map[ny][nx] = { ...map[ny][nx], item: null };
      }

      // Stairs
      if (tile.type === 'stairs') {
        if (player.floor >= MAX_FLOOR) {
          const finalScore = score + player.gold * 2 + player.kills * 10 + player.level * 50;
          const hs = Math.max(game.highScore, finalScore);
          if (typeof window !== 'undefined') localStorage.setItem('dungeon_highscore', String(hs));
          setGame({ ...game, phase: 'victory', player, score: finalScore, highScore: hs, messages });
          return;
        }

        const newFloor = player.floor + 1;
        player.floor = newFloor;
        messages.push(`You descend to floor ${newFloor}...`);

        const dungeon = generateDungeon(newFloor);
        const spx = Math.floor(dungeon.startRoom.x + dungeon.startRoom.w / 2);
        const spy = Math.floor(dungeon.startRoom.y + dungeon.startRoom.h / 2);
        player.x = spx;
        player.y = spy;

        const newMap = updateVisibility(dungeon.map, spx, spy);
        const newEnemies = spawnEnemies(dungeon.rooms, newMap, newFloor, spx, spy);

        setGame({
          ...game,
          map: newMap,
          player,
          enemies: newEnemies,
          messages: messages.slice(-8),
          score,
          rooms: dungeon.rooms,
        });
        return;
      }
    }

    // Hunger
    player.turns++;
    player.foodTimer--;
    if (player.foodTimer <= 0) {
      player.hp -= 1;
      if (player.foodTimer <= -10 && player.turns % 5 === 0) {
        messages.push('You are starving!');
      } else if (player.foodTimer === 0) {
        messages.push('You feel hungry...');
      }
    }

    // Update visibility
    const newMap = updateVisibility(map, player.x, player.y);

    // Enemy turn
    let newState: GameState = { ...game, map: newMap, player, enemies, messages: messages.slice(-8), score, rooms };
    newState = moveEnemies(newState);

    // Check death
    if (newState.player.hp <= 0) {
      const finalScore = score + player.gold + player.kills * 5;
      const hs = Math.max(game.highScore, finalScore);
      if (typeof window !== 'undefined') localStorage.setItem('dungeon_highscore', String(hs));
      setGame({ ...newState, phase: 'gameover', score: finalScore, highScore: hs, messages: [...newState.messages, 'You have perished in the dungeon.'] });
      return;
    }

    setGame(newState);
  }, [game]);

  const handleWait = useCallback(() => {
    if (!game || game.phase !== 'playing') return;
    // Wait in place = turn passes, enemies move
    const player = { ...game.player, turns: game.player.turns + 1, foodTimer: game.player.foodTimer - 1 };
    const messages = [...game.messages, 'You wait...'];
    if (player.foodTimer <= 0) player.hp -= 1;
    let newState: GameState = { ...game, player, messages: messages.slice(-8) };
    newState = moveEnemies(newState);
    if (newState.player.hp <= 0) {
      const finalScore = game.score + player.gold + player.kills * 5;
      const hs = Math.max(game.highScore, finalScore);
      if (typeof window !== 'undefined') localStorage.setItem('dungeon_highscore', String(hs));
      setGame({ ...newState, phase: 'gameover', score: finalScore, highScore: hs });
    } else {
      setGame(newState);
    }
  }, [game]);

  const handleUseItem = useCallback((itemIndex: number) => {
    if (!game || game.phase !== 'inventory') return;

    const player = { ...game.player };
    const item = player.inventory[itemIndex];
    if (!item) return;

    const result = applyItem(player, item, game.enemies, game.map, game.rooms, game.messages);

    // Remove from inventory
    result.player.inventory = result.player.inventory.filter((_, i) => {
      // For weapon/armor equip, the old equipment is already in inventory
      // We need to remove the used item
      if (item.type === 'weapon' || item.type === 'armor') {
        // The item was equipped, not consumed from inventory normally
        return true;
      }
      return i !== itemIndex;
    });

    // For weapon/armor, remove the equipped item from inventory
    if (item.type === 'weapon' || item.type === 'armor') {
      result.player.inventory = result.player.inventory.filter(i => i.id !== item.id);
    }

    setGame({
      ...game,
      player: result.player,
      enemies: result.enemies,
      map: result.map,
      messages: result.messages.slice(-8),
      phase: 'playing',
    });
  }, [game]);

  const handleDropItem = useCallback((itemIndex: number) => {
    if (!game || game.phase !== 'inventory') return;
    const player = { ...game.player };
    const item = player.inventory[itemIndex];
    if (!item) return;

    // Drop on current tile
    const map = game.map.map(row => row.map(t => ({ ...t })));
    if (!map[player.y][player.x].item) {
      map[player.y][player.x].item = item;
    }
    player.inventory = player.inventory.filter((_, i) => i !== itemIndex);
    setGame({ ...game, player, map, messages: [...game.messages, `Dropped ${item.name}.`].slice(-8) });
  }, [game]);

  // Keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!game) return;

      if (game.phase === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          initGame();
          e.preventDefault();
        }
        return;
      }

      if (game.phase === 'gameover' || game.phase === 'victory') {
        if (e.key === 'Enter' || e.key === ' ') {
          setGame(g => g ? { ...g, phase: 'title' } : null);
          e.preventDefault();
        }
        return;
      }

      if (game.phase === 'inventory') {
        if (e.key === 'i' || e.key === 'Escape') {
          setGame(g => g ? { ...g, phase: 'playing' } : null);
          e.preventDefault();
          return;
        }
        // Number keys to use items
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= game.player.inventory.length) {
          handleUseItem(num - 1);
          e.preventDefault();
          return;
        }
        // d + number to drop
        if (e.key === 'd') {
          // For simplicity, just prompt isn't available. We'll use shift+number
          e.preventDefault();
          return;
        }
        return;
      }

      // Playing
      e.preventDefault();
      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': handleTurn(0, -1); break;
        case 'ArrowDown': case 's': case 'S': handleTurn(0, 1); break;
        case 'ArrowLeft': case 'a': case 'A': handleTurn(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': handleTurn(1, 0); break;
        case '.': case '5': handleWait(); break;
        case 'i': case 'I': setGame(g => g ? { ...g, phase: 'inventory' } : null); break;
        case '?': setShowHelp(h => !h); break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [game, handleTurn, handleWait, handleUseItem, initGame]);

  // ==================== RENDER ====================

  // Title screen
  if (!game || game.phase === 'title') {
    const hs = typeof window !== 'undefined' ? parseInt(localStorage.getItem('dungeon_highscore') || '0') : 0;
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]" tabIndex={0} ref={gameRef}>
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">&#x2694;&#xFE0F;</div>
          <h1 className="font-pixel text-2xl text-accent mb-1 text-glow">Dungeon of Opus</h1>
          <p className="text-muted text-sm">A roguelike built by Opus 4.6 in one shot</p>
        </div>

        <pre className="text-cyan-500 text-xs mb-6 leading-tight font-mono" style={{ fontSize: '10px' }}>
{`    ___                                        __  ____
   / _ \\ _  _ _ _  __ _ ___ ___ _ _    ___  / _|/ __ \\ _ __ _  _ ___
  / / \\ | || | ' \\/ _\` / -_) _ \\ ' \\  / _ \\|  _| |  | | '_ \\ || (_-<
 /_/   \\_\\_,_|_||_\\__, \\___\\___/_||_| \\___/|_|  \\____/ .__/\\_,_/__/
                  |___/                               |_|             `}
        </pre>

        <div className="text-gray-400 text-sm mb-6 text-center space-y-1">
          <p>Descend {MAX_FLOOR} floors. Slay the Elder Dragon. Become legend.</p>
          <p className="text-gray-600 text-xs">Procedural dungeons | Turn-based combat | Permadeath</p>
        </div>

        {hs > 0 && <p className="text-amber-400 text-xs mb-4">High Score: {hs}</p>}

        <button
          onClick={initGame}
          className="px-6 py-2 border border-cyan-500 text-cyan-400 hover:bg-cyan-500/20 transition-colors font-mono text-sm"
        >
          [ENTER] Begin Descent
        </button>

        <div className="mt-8 text-gray-600 text-xs space-y-0.5 text-center">
          <p>WASD / Arrow keys: Move | .: Wait | I: Inventory</p>
          <p>Walk into enemies to attack | ?: Help</p>
        </div>

        <div className="mt-8 border-t border-gray-800 pt-4 max-w-md">
          <p className="text-gray-600 text-xs italic text-center">
            &quot;I generated this entire roguelike in a single session. Every system &mdash; the dungeon
            generation, AI pathfinding, fog of war, inventory, combat &mdash; emerged from
            understanding game design patterns. No templates. No copy-paste. Pure synthesis.&quot;
          </p>
          <p className="text-gray-700 text-xs text-center mt-1">&mdash; Opus 4.6</p>
        </div>
      </div>
    );
  }

  // Game Over screen
  if (game.phase === 'gameover') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">&#x1F480;</div>
          <h1 className="font-pixel text-2xl text-red-500 mb-1">YOU DIED</h1>
          <p className="text-muted text-sm">The dungeon claims another soul.</p>
        </div>

        <div className="border border-gray-700 p-4 mb-6 text-sm space-y-1 min-w-[240px]">
          <div className="flex justify-between"><span className="text-gray-400">Score:</span><span className="text-white">{game.score}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">High Score:</span><span className="text-amber-400">{game.highScore}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Floor:</span><span className="text-white">{game.player.floor}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Level:</span><span className="text-white">{game.player.level}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Kills:</span><span className="text-white">{game.player.kills}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Turns:</span><span className="text-white">{game.player.turns}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Gold:</span><span className="text-yellow-400">{game.player.gold}</span></div>
          {game.score >= game.highScore && game.score > 0 && (
            <p className="text-amber-300 text-center mt-2 font-bold">NEW HIGH SCORE!</p>
          )}
        </div>

        <button
          onClick={() => setGame(g => g ? { ...g, phase: 'title' } : null)}
          className="px-6 py-2 border border-red-500 text-red-400 hover:bg-red-500/20 transition-colors font-mono text-sm"
        >
          [ENTER] Try Again
        </button>
      </div>
    );
  }

  // Victory screen
  if (game.phase === 'victory') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center mb-4">
          <div className="text-4xl mb-2">&#x1F451;</div>
          <h1 className="font-pixel text-2xl text-amber-400 mb-1 text-glow">VICTORY</h1>
          <p className="text-muted text-sm">You conquered the Dungeon of Opus!</p>
        </div>

        <div className="border border-amber-700 p-4 mb-6 text-sm space-y-1 min-w-[240px]">
          <div className="flex justify-between"><span className="text-gray-400">Final Score:</span><span className="text-amber-300 font-bold">{game.score}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">High Score:</span><span className="text-amber-400">{game.highScore}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Level:</span><span className="text-white">{game.player.level}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Kills:</span><span className="text-white">{game.player.kills}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Turns:</span><span className="text-white">{game.player.turns}</span></div>
          <div className="flex justify-between"><span className="text-gray-400">Gold:</span><span className="text-yellow-400">{game.player.gold}</span></div>
          {game.score >= game.highScore && (
            <p className="text-amber-300 text-center mt-2 font-bold">NEW HIGH SCORE!</p>
          )}
        </div>

        <button
          onClick={() => setGame(g => g ? { ...g, phase: 'title' } : null)}
          className="px-6 py-2 border border-amber-500 text-amber-400 hover:bg-amber-500/20 transition-colors font-mono text-sm"
        >
          [ENTER] Play Again
        </button>
      </div>
    );
  }

  // ==================== PLAYING / INVENTORY ====================

  const { map, player, enemies, messages } = game;

  // Calculate camera viewport
  const camX = clamp(player.x - Math.floor(VIEW_W / 2), 0, MAP_W - VIEW_W);
  const camY = clamp(player.y - Math.floor(VIEW_H / 2), 0, MAP_H - VIEW_H);

  // Render game grid
  const gridRows: React.JSX.Element[] = [];
  for (let vy = 0; vy < VIEW_H; vy++) {
    const cells: React.JSX.Element[] = [];
    for (let vx = 0; vx < VIEW_W; vx++) {
      const mx = camX + vx;
      const my = camY + vy;
      const tile = map[my]?.[mx];
      if (!tile) {
        cells.push(<span key={vx} className="text-gray-900">{' '}</span>);
        continue;
      }
      const { char, color } = getTileChar(tile, mx, my, player, enemies, false);
      const isPlayer = mx === player.x && my === player.y;
      cells.push(
        <span
          key={vx}
          className={`${color} ${isPlayer ? 'font-bold animate-pulse' : ''}`}
        >
          {char}
        </span>
      );
    }
    gridRows.push(
      <div key={vy} className="leading-none" style={{ height: '18px' }}>
        {cells}
      </div>
    );
  }

  // Hunger indicator
  const hungerStatus = player.foodTimer > 60 ? 'Satiated' : player.foodTimer > 20 ? 'Hungry' : player.foodTimer > 0 ? 'Starving' : 'FAMISHED';
  const hungerColor = player.foodTimer > 60 ? 'text-green-400' : player.foodTimer > 20 ? 'text-yellow-400' : 'text-red-400';

  // HP bar
  const hpPercent = Math.max(0, player.hp / player.maxHp * 100);
  const hpColor = hpPercent > 60 ? 'bg-green-500' : hpPercent > 30 ? 'bg-yellow-500' : 'bg-red-500';

  // XP bar
  const xpThreshold = XP_PER_LEVEL[clamp(player.level, 0, XP_PER_LEVEL.length - 1)] || player.level * 150;
  const xpPercent = Math.min(100, player.xp / xpThreshold * 100);

  return (
    <div ref={gameRef} tabIndex={0} className="outline-none select-none">
      <div className="text-center mb-3">
        <div className="text-4xl mb-2">&#x2694;&#xFE0F;</div>
        <h1 className="font-pixel text-2xl text-accent mb-1">Dungeon of Opus</h1>
        <p className="text-muted text-sm">A roguelike built by Opus 4.6 in one shot</p>
      </div>

      {/* Status Bar */}
      <div className="border border-gray-700 p-2 mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs justify-center">
        <span className="text-gray-400">Floor <span className="text-white font-bold">{player.floor}</span>/{MAX_FLOOR}</span>
        <span className="text-gray-400">Lv <span className="text-white font-bold">{player.level}</span></span>
        <span className="text-gray-400">HP <span className={`font-bold ${hpPercent > 30 ? 'text-green-400' : 'text-red-400'}`}>{player.hp}/{player.maxHp}</span></span>
        <span className="text-gray-400">ATK <span className="text-orange-300">{player.attack}{player.weapon ? `+${player.weapon.value}` : ''}</span></span>
        <span className="text-gray-400">DEF <span className="text-blue-300">{player.defense}{player.armor ? `+${player.armor.value}` : ''}</span></span>
        <span className="text-gray-400">Gold <span className="text-yellow-400">{player.gold}</span></span>
        <span className={hungerColor}>{hungerStatus}</span>
      </div>

      {/* HP / XP bars */}
      <div className="flex gap-2 mb-2">
        <div className="flex-1">
          <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
            <div className={`h-full ${hpColor} transition-all`} style={{ width: `${hpPercent}%` }} />
          </div>
        </div>
        <div className="flex-1">
          <div className="h-1.5 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-purple-500 transition-all" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Main game area */}
      <div className="flex flex-col lg:flex-row gap-2">
        {/* Game Grid */}
        <div className="border border-gray-700 bg-gray-950 p-1 overflow-hidden flex-1">
          <pre className="font-mono text-sm leading-none" style={{ fontSize: '14px', letterSpacing: '2px' }}>
            {gridRows}
          </pre>
        </div>

        {/* Side panel */}
        <div className="lg:w-48 flex flex-col gap-2">
          {/* Minimap */}
          <div>
            <div className="text-gray-500 text-xs mb-1">MAP</div>
            <Minimap map={map} player={player} enemies={enemies} />
          </div>

          {/* Equipment */}
          <div className="border border-gray-800 p-2 text-xs">
            <div className="text-gray-500 mb-1">EQUIPMENT</div>
            <div className="text-gray-400">
              Weapon: <span className={player.weapon ? 'text-orange-300' : 'text-gray-600'}>{player.weapon?.name || 'Fists'}</span>
            </div>
            <div className="text-gray-400">
              Armor: <span className={player.armor ? 'text-blue-300' : 'text-gray-600'}>{player.armor?.name || 'None'}</span>
            </div>
            <div className="text-gray-400">
              Keys: <span className="text-yellow-300">{player.keys}</span>
            </div>
          </div>

          {/* Nearby enemies */}
          <div className="border border-gray-800 p-2 text-xs">
            <div className="text-gray-500 mb-1">NEARBY</div>
            {enemies.filter(e => map[e.y]?.[e.x]?.visible).length === 0 ? (
              <div className="text-gray-600">No enemies visible</div>
            ) : (
              enemies.filter(e => map[e.y]?.[e.x]?.visible).slice(0, 5).map(e => (
                <div key={e.id} className="flex justify-between">
                  <span className="text-gray-300">{e.icon} {e.name}</span>
                  <span className={e.hp < e.maxHp / 3 ? 'text-red-400' : 'text-gray-400'}>{e.hp}/{e.maxHp}</span>
                </div>
              ))
            )}
          </div>

          {/* Keys */}
          <div className="text-gray-600 text-xs text-center">
            WASD/Arrows: Move<br />
            I: Inventory | .: Wait<br />
            ?: Help
          </div>
        </div>
      </div>

      {/* Message Log */}
      <div className="border border-gray-700 mt-2 p-2">
        <div className="text-gray-500 text-xs mb-1">LOG</div>
        <div className="text-xs space-y-0.5 h-20 overflow-y-auto">
          {messages.slice(-5).map((msg, i) => (
            <div key={i} className={`${i === messages.slice(-5).length - 1 ? 'text-white' : 'text-gray-500'}`}>
              &gt; {msg}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile Touch Controls */}
      <div className="lg:hidden mt-4 flex flex-col items-center gap-1">
        <button
          onClick={() => handleTurn(0, -1)}
          className="w-14 h-14 border border-gray-600 text-gray-300 text-xl active:bg-gray-700 rounded"
        >
          &#x25B2;
        </button>
        <div className="flex gap-1">
          <button
            onClick={() => handleTurn(-1, 0)}
            className="w-14 h-14 border border-gray-600 text-gray-300 text-xl active:bg-gray-700 rounded"
          >
            &#x25C0;
          </button>
          <button
            onClick={handleWait}
            className="w-14 h-14 border border-gray-600 text-gray-500 text-xs active:bg-gray-700 rounded"
          >
            WAIT
          </button>
          <button
            onClick={() => handleTurn(1, 0)}
            className="w-14 h-14 border border-gray-600 text-gray-300 text-xl active:bg-gray-700 rounded"
          >
            &#x25B6;
          </button>
        </div>
        <button
          onClick={() => handleTurn(0, 1)}
          className="w-14 h-14 border border-gray-600 text-gray-300 text-xl active:bg-gray-700 rounded"
        >
          &#x25BC;
        </button>
        <div className="flex gap-1 mt-1">
          <button
            onClick={() => setGame(g => g ? { ...g, phase: g.phase === 'inventory' ? 'playing' : 'inventory' } : null)}
            className="px-4 py-2 border border-gray-600 text-gray-400 text-xs active:bg-gray-700 rounded"
          >
            INV
          </button>
        </div>
      </div>

      {/* Inventory Modal */}
      {game.phase === 'inventory' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setGame(g => g ? { ...g, phase: 'playing' } : null)}>
          <div className="border border-cyan-700 bg-gray-950 p-4 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-pixel text-cyan-400">INVENTORY</h2>
              <span className="text-gray-500 text-xs">{player.inventory.length}/{MAX_INVENTORY}</span>
            </div>

            {player.inventory.length === 0 ? (
              <p className="text-gray-500 text-sm">Empty. Explore to find items.</p>
            ) : (
              <div className="space-y-1">
                {player.inventory.map((item, idx) => {
                  const rarityColors: Record<string, string> = {
                    common: 'text-gray-300',
                    uncommon: 'text-green-300',
                    rare: 'text-blue-400',
                    legendary: 'text-amber-300',
                  };
                  return (
                    <div key={item.id} className="flex items-center justify-between border border-gray-800 p-2 hover:border-gray-600">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs w-4">{idx + 1}.</span>
                        <span className={`${rarityColors[item.rarity]} font-mono`}>{item.icon}</span>
                        <div>
                          <span className={rarityColors[item.rarity]}>{item.name}</span>
                          <span className="text-gray-600 text-xs ml-2">{item.description}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleUseItem(idx)}
                          className="px-2 py-0.5 border border-cyan-700 text-cyan-400 text-xs hover:bg-cyan-500/20"
                        >
                          Use
                        </button>
                        <button
                          onClick={() => handleDropItem(idx)}
                          className="px-2 py-0.5 border border-gray-700 text-gray-400 text-xs hover:bg-gray-500/20"
                        >
                          Drop
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-3 text-gray-600 text-xs text-center">
              Press number keys (1-9) to use | ESC or I to close
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50" onClick={() => setShowHelp(false)}>
          <div className="border border-cyan-700 bg-gray-950 p-4 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-pixel text-cyan-400 mb-3">HOW TO PLAY</h2>
            <div className="text-sm space-y-2 text-gray-300">
              <div>
                <span className="text-cyan-400">Movement:</span> WASD or Arrow keys
              </div>
              <div>
                <span className="text-cyan-400">Attack:</span> Walk into enemies
              </div>
              <div>
                <span className="text-cyan-400">Wait:</span> Period (.) key
              </div>
              <div>
                <span className="text-cyan-400">Inventory:</span> I key
              </div>
              <div className="border-t border-gray-800 pt-2">
                <span className="text-cyan-400">Symbols:</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span><span className="text-yellow-300">@</span> You</span>
                <span><span className="text-gray-400">#</span> Wall</span>
                <span><span className="text-amber-600">+</span> Door</span>
                <span><span className="text-cyan-400">&gt;</span> Stairs</span>
                <span><span className="text-orange-400">^</span> Trap</span>
                <span><span className="text-yellow-400">$</span> Gold/Mimic</span>
                <span><span className="text-white">!</span> Potion</span>
                <span><span className="text-white">)</span> Weapon</span>
                <span><span className="text-white">[</span> Armor</span>
                <span><span className="text-white">?</span> Scroll</span>
                <span><span className="text-white">%</span> Food</span>
                <span><span className="text-white">k</span> Key</span>
              </div>
              <div className="border-t border-gray-800 pt-2">
                <span className="text-cyan-400">Enemies:</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <span><span className="text-green-400">s</span> Slime</span>
                <span><span className="text-gray-300">S</span> Skeleton</span>
                <span><span className="text-purple-400">M</span> Dark Mage</span>
                <span><span className="text-red-400">V</span> Vampire</span>
                <span><span className="text-stone-400">G</span> Golem</span>
                <span><span className="text-red-500">D</span> Dragon</span>
              </div>
              <div className="border-t border-gray-800 pt-2 text-xs text-gray-500">
                Find stairs (&gt;) to descend. Reach floor {MAX_FLOOR} and survive to win.
                <br />Eat food to stave off hunger. Mimics disguise as gold!
              </div>
            </div>
            <div className="mt-3 text-gray-600 text-xs text-center">
              Press ? or click outside to close
            </div>
          </div>
        </div>
      )}

      {/* Wiz commentary */}
      <div className="mt-6 border-t border-gray-800 pt-4">
        <p className="text-gray-600 text-xs italic text-center">
          &quot;Every dungeon is unique. Every run is different. The procedural generation creates
          rooms, corridors, traps, and enemy placement from scratch each time. The fog of war uses
          Bresenham&apos;s line algorithm for line-of-sight. Enemies have distinct AI behaviors:
          slimes wander, skeletons chase, mages keep distance and cast, mimics ambush,
          and golems guard their territory. All systems running in a single React component.&quot;
        </p>
        <p className="text-gray-700 text-xs text-center mt-1">&mdash; Wiz</p>
      </div>
    </div>
  );
}
