import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';
import { Shield, ShieldType } from './Shield';

export interface BossConfig {
  radius: number;
  speed: number;
  fireRate: number;
  bulletSpeed: number;
  shieldCooldown: number;
  color: number;
  movementPattern: 'wander' | 'orbit';
  orbitRadius: number;
  orbitSpeed: number;
  orbitDirection: 1 | -1;
}

export class Boss {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private innerRing: Phaser.GameObjects.Arc;
  private slowIndicator: Phaser.GameObjects.Arc;
  public x: number;
  public y: number;
  
  // Movement pattern
  private targetX: number;
  private targetY: number;
  private moveTimer: number = 0;
  private orbitAngle: number = 0;
  
  // Shooting
  private lastFireTime: number = 0;
  public canFire: boolean = true;
  
  // Shield
  public shield: Shield | null = null;
  public shieldActive: boolean = false;
  private lastShieldTime: number = 0;
  private aimAngle: number = 0;
  private nextShieldType: ShieldType = 'narrow';
  private config: BossConfig;
  private slowUntil = 0;
  private slowStacks = 0;
  private slowStackMultiplier = 1;
  private freezeUntil = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, config: Partial<BossConfig> = {}) {
    this.scene = scene;
    this.config = {
      radius: GAME_CONFIG.BOSS_RADIUS,
      speed: GAME_CONFIG.BOSS_SPEED,
      fireRate: GAME_CONFIG.BOSS_FIRE_RATE,
      bulletSpeed: GAME_CONFIG.BOSS_BULLET_SPEED,
      shieldCooldown: GAME_CONFIG.BOSS_SHIELD_COOLDOWN,
      color: GAME_CONFIG.BOSS_COLOR,
      movementPattern: 'wander',
      orbitRadius: 200,
      orbitSpeed: 1.3,
      orbitDirection: Math.random() < 0.5 ? -1 : 1,
      ...config,
    };
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    this.orbitAngle = Phaser.Math.Angle.Between(x, y, this.targetX + 1, this.targetY);
    
    // Create boss visual (larger circle with inner ring)
    this.body = scene.add.circle(0, 0, this.config.radius, this.config.color);
    this.body.setStrokeStyle(3, 0xffffff, 0.3);
    
    this.innerRing = scene.add.circle(0, 0, this.config.radius * 0.6, 0x000000, 0);
    this.innerRing.setStrokeStyle(2, this.config.color, 0.5);
    
    // Container for boss graphics
    this.sprite = scene.add.container(x, y, [this.body, this.innerRing]);

    const slowRadius = GAME_CONFIG.BULLET_RADIUS * 1.4;
    this.slowIndicator = scene.add.circle(0, 0, slowRadius, GAME_CONFIG.RED_BULLET_COLOR);
    this.slowIndicator.setStrokeStyle(1, GAME_CONFIG.RED_BULLET_STROKE_COLOR, 0.7);
    this.slowIndicator.setAlpha(0.9);
    this.slowIndicator.setVisible(false);
    this.sprite.add(this.slowIndicator);
  }

  update(delta: number, playerX: number, playerY: number, currentTime: number) {
    // Update movement target periodically
    if (this.config.movementPattern === 'orbit') {
      this.updateOrbitTarget(delta, playerX, playerY);
    } else {
      this.moveTimer += delta;
      if (this.moveTimer > 2000) {
        this.moveTimer = 0;
        this.pickNewTarget(playerX, playerY);
      }
    }
    
    // Move towards target
    const isSlowed = currentTime < this.slowUntil && this.slowStacks > 0;
    if (!isSlowed && this.slowStacks > 0) {
      this.slowStacks = 0;
    }
    if (this.slowIndicator.visible !== isSlowed) {
      this.slowIndicator.setVisible(isSlowed);
    }
    const speed = this.config.speed * this.getSpeedMultiplier(currentTime) * (delta / 1000);
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    }
    
    // Clamp to screen bounds
    const padding = this.config.radius;
    const xMin = padding + 100;
    const xMax = GAME_CONFIG.WIDTH - padding - 100;
    const yMin = padding + 100;
    const yMax = this.config.movementPattern === 'orbit' ? GAME_CONFIG.HEIGHT - padding - 100 : GAME_CONFIG.HEIGHT * 0.5;
    this.x = Phaser.Math.Clamp(this.x, xMin, xMax);
    this.y = Phaser.Math.Clamp(this.y, yMin, yMax);
    
    // Update sprite position
    this.sprite.setPosition(this.x, this.y);
    
    // Check if can fire
    const fireInterval = 1000 / this.config.fireRate;
    this.canFire = currentTime - this.lastFireTime > fireInterval;
    
    // Update shield angle to face player
    this.aimAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    
    // Shield logic
    if (!this.shieldActive && currentTime - this.lastShieldTime > this.config.shieldCooldown) {
      this.activateShield(currentTime);
    }
    
    // Update shield position if active
    if (this.shield && this.shieldActive) {
      if (!this.shield.active) {
        this.shield = null;
        this.shieldActive = false;
      } else {
        this.shield.update(this.x, this.y, this.aimAngle);
      }
    }
  }

  updateSlowVisuals(currentTime: number) {
    const isSlowed = currentTime < this.slowUntil && this.slowStacks > 0;
    if (!isSlowed && this.slowStacks > 0) {
      this.slowStacks = 0;
    }
    if (this.slowIndicator.visible !== isSlowed) {
      this.slowIndicator.setVisible(isSlowed);
    }
  }

  getMovementSpeedMultiplier(currentTime: number) {
    return this.getSpeedMultiplier(currentTime);
  }

  private pickNewTarget(playerX: number, playerY: number) {
    // Move around the player's general area, staying in upper screen
    const offsetX = Phaser.Math.Between(-200, 200);
    const offsetY = Phaser.Math.Between(-100, 100);
    
    this.targetX = playerX + offsetX;
    this.targetY = Math.min(playerY - 150 + offsetY, GAME_CONFIG.HEIGHT * 0.4);
  }

  private updateOrbitTarget(delta: number, playerX: number, playerY: number) {
    const orbitStep = (delta / 1000) * this.config.orbitSpeed * this.config.orbitDirection;
    this.orbitAngle += orbitStep;
    this.targetX = playerX + Math.cos(this.orbitAngle) * this.config.orbitRadius;
    this.targetY = playerY + Math.sin(this.orbitAngle) * this.config.orbitRadius;
  }

  fire(currentTime: number): { x: number; y: number; angle: number } | null {
    if (!this.canFire) return null;
    
    this.lastFireTime = currentTime;
    return {
      x: this.x,
      y: this.y,
      angle: this.aimAngle, // Fire towards player
    };
  }

  setFireRate(fireRate: number) {
    this.config.fireRate = fireRate;
  }

  activateShield(currentTime: number) {
    if (this.shieldActive) return;
    
    this.shieldActive = true;
    this.lastShieldTime = currentTime;
    
    const shieldType = this.nextShieldType;
    this.nextShieldType = shieldType === 'narrow' ? 'wide' : 'narrow';

    this.shield = new Shield(this.scene, this.x, this.y, this.aimAngle, shieldType, this.config.radius);
  }

  deactivateShield() {
    if (this.shield) {
      this.shield.destroy();
      this.shield = null;
    }
    this.shieldActive = false;
  }

  getBulletSpeed(currentTime: number, baseSpeed: number = this.config.bulletSpeed) {
    return baseSpeed * this.getBulletSpeedMultiplier(currentTime);
  }

  getRadius() {
    return this.config.radius;
  }

  getShieldBounds(): Phaser.Geom.Rectangle | Phaser.Geom.Circle | null {
    if (!this.shield || !this.shieldActive) return null;
    if (!this.shield.active) {
      this.shield = null;
      this.shieldActive = false;
      return null;
    }
    return this.shield.getBounds();
  }

  applyShieldDamage(amount: number) {
    if (!this.shield || !this.shieldActive) return;
    this.shield.applyDamage(amount);
    if (!this.shield.active) {
      this.shield = null;
      this.shieldActive = false;
    }
  }

  destroy() {
    this.deactivateShield();
    this.sprite.destroy();
  }

  applySlow(durationMs: number, multiplier: number) {
    const now = this.scene.time.now;
    if (multiplier >= 1) {
      this.slowStacks = 0;
      this.slowUntil = 0;
      this.slowStackMultiplier = 1;
      this.freezeUntil = 0;
      return;
    }
    const isActive = now < this.slowUntil;
    if (isActive) {
      this.freezeUntil = Math.max(this.freezeUntil, now + GAME_CONFIG.RED_BULLET_FREEZE_DURATION);
    }
    this.slowStacks = isActive ? Math.min(this.slowStacks + 1, GAME_CONFIG.RED_BULLET_MAX_STACKS) : 1;
    this.slowUntil = now + durationMs;
    this.slowStackMultiplier = multiplier;
  }

  private getSpeedMultiplier(currentTime: number) {
    if (currentTime < this.freezeUntil) {
      return 0;
    }
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(this.slowStackMultiplier, stacks);
  }

  private getBulletSpeedMultiplier(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(GAME_CONFIG.RED_BULLET_ENEMY_BULLET_SPEED_MULTIPLIER, stacks);
  }

  private getSlowStacks(currentTime: number) {
    return currentTime < this.slowUntil ? this.slowStacks : 0;
  }
}
