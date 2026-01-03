// Game balance constants - adjust these to tune gameplay
export const GAME_CONFIG = {
  // Game dimensions
  WIDTH: 1280,
  HEIGHT: 720,
  
  // Colors (fluorescent cyan/teal)
  BULLET_COLOR: 0x00ffd5,
  BULLET_COLOR_HEX: '#00FFD5',
  BOSS_BULLET_COLOR: 0x00e5c8,
  SHIELD_COLOR: 0x00ffd5,
  SHIELD_GLOW_COLOR: 0x00b89c,
  PLAYER_COLOR: 0x00ffd5,
  BOSS_COLOR: 0xff6b6b,
  BACKGROUND_COLOR: 0x0a0a12,
  UI_BG_COLOR: 0x1a1a2e,
  
  // Player stats
  PLAYER_SPEED: 260,
  PLAYER_RADIUS: 12,
  PLAYER_TRION_MAX: 100,
  
  // Boss stats
  BOSS_RADIUS: 35,
  BOSS_SPEED: 100,
  BOSS_TRION_MAX: 180,
  BOSS_FIRE_RATE: 2.1, // shots per second
  BOSS_BULLET_SPEED: 420,
  BOSS_SHIELD_COOLDOWN: 3000, // ms
  
  // Trion system
  TRION_REGEN_RATE: 10, // per second
  
  // Bullets
  BULLET_SPEED: 650,
  BULLET_RADIUS: 6,
  FIRE_RATE: 7, // shots per second
  
  // Asteroid bullet
  ASTEROID_COST: 2,
  ASTEROID_TRION_DAMAGE: 10,
  ASTEROID_SHIELD_DAMAGE: 9,
  ASTEROID_DIVIDE_COUNT: 3,
  ASTEROID_DIVIDE_EXTRA_COST: 2,
  ASTEROID_DIVIDE_SPREAD: 0.15, // radians
  ASTEROID_DIVIDE_TRION_DAMAGE: 10, // per bullet when divided
  ASTEROID_DIVIDE_SHIELD_DAMAGE: 5, // per bullet when divided
  
  // Meteora bullet
  METEORA_COST: 4,
  METEORA_TRION_DAMAGE: 5,
  METEORA_SHIELD_DAMAGE: 20,
  METEORA_EXPLOSION_RADIUS: 70,
  METEORA_EXPLOSION_DURATION: 200, // ms
  
  // Viper bullet (guided)
  VIPER_COST: 5,
  VIPER_TRION_DAMAGE: 9,
  VIPER_SHIELD_DAMAGE: 4,
  VIPER_SPEED: 400,
  VIPER_TURN_RATE: 4.5, // radians per second
  VIPER_LIFETIME: 2500, // ms before auto-destroy
  VIPER_COLOR: 0x00e5ff, // slightly different cyan for viper
  
  // Shield
  SHIELD_COST: 8,
  SHIELD_NARROW_STRENGTH: 18,
  SHIELD_WIDE_STRENGTH: 10,
  SHIELD_NARROW_WIDTH: 3.5, // multiplier of bullet diameter
  SHIELD_THICKNESS: 8,
  SHIELD_DISTANCE: 40, // distance from player/boss center (narrow)
  SHIELD_WIDE_PADDING: 22, // extra radius beyond player/boss size
};

export type BulletType = 'asteroid' | 'meteora' | 'viper';

export interface GameState {
  playerTrion: number;
  bossTrion: number;
  currentBulletType: BulletType;
  divideEnabled: boolean;
  delayedAsteroidEnabled: boolean;
  isGameOver: boolean;
  playerWon: boolean;
}
