import Phaser from 'phaser';
import { GAME_CONFIG, BulletType } from '../constants';

export class Bullet {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Arc;
  public x: number;
  public y: number;
  public velocityX: number;
  public velocityY: number;
  public type: BulletType;
  public damage: number;
  public isPlayerBullet: boolean;
  public active: boolean = true;
  public hasExploded: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    type: BulletType,
    isPlayerBullet: boolean,
    damage: number,
    speed: number = GAME_CONFIG.BULLET_SPEED
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.type = type;
    this.isPlayerBullet = isPlayerBullet;
    this.damage = damage;
    
    this.velocityX = Math.cos(angle) * speed;
    this.velocityY = Math.sin(angle) * speed;
    
    const color = isPlayerBullet ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_BULLET_COLOR;
    const radius = type === 'meteora' ? GAME_CONFIG.BULLET_RADIUS * 1.3 : GAME_CONFIG.BULLET_RADIUS;
    
    this.sprite = scene.add.circle(x, y, radius, color);
    this.sprite.setStrokeStyle(1, 0xffffff, 0.5);
    
    // Add glow effect
    this.sprite.setAlpha(0.9);
  }

  update(delta: number) {
    if (!this.active) return;
    
    const dt = delta / 1000;
    this.x += this.velocityX * dt;
    this.y += this.velocityY * dt;
    
    this.sprite.setPosition(this.x, this.y);
    
    // Check if out of bounds
    if (
      this.x < -50 ||
      this.x > GAME_CONFIG.WIDTH + 50 ||
      this.y < -50 ||
      this.y > GAME_CONFIG.HEIGHT + 50
    ) {
      this.destroy();
    }
  }

  explode(): Phaser.GameObjects.Arc | null {
    if (!this.active || this.type !== 'meteora' || this.hasExploded) return null;
    
    this.hasExploded = true;
    
    // Create explosion visual
    const explosion = this.scene.add.circle(
      this.x,
      this.y,
      GAME_CONFIG.METEORA_EXPLOSION_RADIUS,
      GAME_CONFIG.BULLET_COLOR,
      0.3
    );
    explosion.setStrokeStyle(3, GAME_CONFIG.BULLET_COLOR, 0.8);
    
    // Animate explosion
    this.scene.tweens.add({
      targets: explosion,
      alpha: 0,
      scale: 1.3,
      duration: GAME_CONFIG.METEORA_EXPLOSION_DURATION,
      ease: 'Power2',
      onComplete: () => {
        explosion.destroy();
      },
    });
    
    this.destroy();
    return explosion;
  }

  destroy() {
    this.active = false;
    this.sprite.destroy();
  }

  getBounds(): Phaser.Geom.Circle {
    return new Phaser.Geom.Circle(this.x, this.y, GAME_CONFIG.BULLET_RADIUS);
  }
}
