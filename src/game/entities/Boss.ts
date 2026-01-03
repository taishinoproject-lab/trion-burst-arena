import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';

export class Boss {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private innerRing: Phaser.GameObjects.Arc;
  public x: number;
  public y: number;
  
  // Movement pattern
  private targetX: number;
  private targetY: number;
  private moveTimer: number = 0;
  
  // Shooting
  private lastFireTime: number = 0;
  public canFire: boolean = true;
  
  // Shield
  public shield: Phaser.GameObjects.Rectangle | null = null;
  public shieldActive: boolean = false;
  private lastShieldTime: number = 0;
  private shieldAngle: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.targetX = x;
    this.targetY = y;
    
    // Create boss visual (larger circle with inner ring)
    this.body = scene.add.circle(0, 0, GAME_CONFIG.BOSS_RADIUS, GAME_CONFIG.BOSS_COLOR);
    this.body.setStrokeStyle(3, 0xffffff, 0.3);
    
    this.innerRing = scene.add.circle(0, 0, GAME_CONFIG.BOSS_RADIUS * 0.6, 0x000000, 0);
    this.innerRing.setStrokeStyle(2, GAME_CONFIG.BOSS_COLOR, 0.5);
    
    // Container for boss graphics
    this.sprite = scene.add.container(x, y, [this.body, this.innerRing]);
  }

  update(delta: number, playerX: number, playerY: number, currentTime: number) {
    // Update movement target periodically
    this.moveTimer += delta;
    if (this.moveTimer > 2000) {
      this.moveTimer = 0;
      this.pickNewTarget(playerX, playerY);
    }
    
    // Move towards target
    const speed = GAME_CONFIG.BOSS_SPEED * (delta / 1000);
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 10) {
      this.x += (dx / dist) * speed;
      this.y += (dy / dist) * speed;
    }
    
    // Clamp to screen bounds (upper portion)
    const padding = GAME_CONFIG.BOSS_RADIUS;
    this.x = Phaser.Math.Clamp(this.x, padding + 100, GAME_CONFIG.WIDTH - padding - 100);
    this.y = Phaser.Math.Clamp(this.y, padding + 100, GAME_CONFIG.HEIGHT * 0.5);
    
    // Update sprite position
    this.sprite.setPosition(this.x, this.y);
    
    // Check if can fire
    const fireInterval = 1000 / GAME_CONFIG.BOSS_FIRE_RATE;
    this.canFire = currentTime - this.lastFireTime > fireInterval;
    
    // Update shield angle to face player
    this.shieldAngle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
    
    // Shield logic
    if (!this.shieldActive && currentTime - this.lastShieldTime > GAME_CONFIG.BOSS_SHIELD_COOLDOWN) {
      this.activateShield(currentTime);
    }
    
    // Update shield position if active
    if (this.shield && this.shieldActive) {
      const shieldDist = GAME_CONFIG.BOSS_RADIUS + 15;
      this.shield.setPosition(
        this.x + Math.cos(this.shieldAngle) * shieldDist,
        this.y + Math.sin(this.shieldAngle) * shieldDist
      );
      this.shield.setRotation(this.shieldAngle + Math.PI / 2);
    }
  }

  private pickNewTarget(playerX: number, playerY: number) {
    // Move around the player's general area, staying in upper screen
    const offsetX = Phaser.Math.Between(-200, 200);
    const offsetY = Phaser.Math.Between(-100, 100);
    
    this.targetX = playerX + offsetX;
    this.targetY = Math.min(playerY - 150 + offsetY, GAME_CONFIG.HEIGHT * 0.4);
  }

  fire(currentTime: number): { x: number; y: number; angle: number } | null {
    if (!this.canFire) return null;
    
    this.lastFireTime = currentTime;
    return {
      x: this.x,
      y: this.y,
      angle: this.shieldAngle, // Fire towards player
    };
  }

  activateShield(currentTime: number) {
    if (this.shieldActive) return;
    
    this.shieldActive = true;
    this.lastShieldTime = currentTime;
    
    const shieldWidth = GAME_CONFIG.BULLET_RADIUS * GAME_CONFIG.SHIELD_WIDTH * 1.5;
    const shieldDist = GAME_CONFIG.BOSS_RADIUS + 15;
    
    this.shield = this.scene.add.rectangle(
      this.x + Math.cos(this.shieldAngle) * shieldDist,
      this.y + Math.sin(this.shieldAngle) * shieldDist,
      GAME_CONFIG.SHIELD_THICKNESS,
      shieldWidth,
      GAME_CONFIG.SHIELD_COLOR,
      0.8
    );
    this.shield.setStrokeStyle(2, 0xffffff, 0.6);
    this.shield.setRotation(this.shieldAngle + Math.PI / 2);
    
    // Deactivate shield after duration
    this.scene.time.delayedCall(GAME_CONFIG.BOSS_SHIELD_DURATION, () => {
      this.deactivateShield();
    });
  }

  deactivateShield() {
    if (this.shield) {
      this.shield.destroy();
      this.shield = null;
    }
    this.shieldActive = false;
  }

  getShieldBounds(): Phaser.Geom.Rectangle | null {
    if (!this.shield || !this.shieldActive) return null;
    
    return this.shield.getBounds();
  }

  destroy() {
    this.deactivateShield();
    this.sprite.destroy();
  }
}
