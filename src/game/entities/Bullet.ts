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
  public trionDamage: number;
  public shieldDamage: number;
  public isPlayerBullet: boolean;
  public active: boolean = true;
  public hasExploded: boolean = false;
  public ignoreShield: boolean = false;
  
  // Viper-specific properties
  private angle: number;
  private speed: number;
  private createdAt: number;
  private trail: Phaser.GameObjects.Arc[] = [];
  private trailTimer: number = 0;
  private viperPathPoints?: { x: number; y: number }[];
  private viperPathIndex = 0;
  private viperPathComplete = false;
  private viperPathLastPoint?: { x: number; y: number };
  private viperPathStartPoint?: { x: number; y: number };
  
  public isHeld: boolean = false;
  public releaseScheduled: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    type: BulletType,
    isPlayerBullet: boolean,
    trionDamage: number,
    shieldDamage: number,
    speed?: number,
    viperPathPoints?: { x: number; y: number }[]
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.type = type;
    this.isPlayerBullet = isPlayerBullet;
    this.trionDamage = trionDamage;
    this.shieldDamage = shieldDamage;
    this.angle = angle;
    if (type === 'viper') {
      this.speed = speed ?? GAME_CONFIG.VIPER_SPEED;
    } else if (type === 'red') {
      this.speed = speed ?? GAME_CONFIG.RED_BULLET_SPEED;
    } else {
      this.speed = speed ?? GAME_CONFIG.BULLET_SPEED;
    }
    this.createdAt = scene.time.now;
    if (type === 'viper' && viperPathPoints) {
      this.viperPathPoints = viperPathPoints;
      this.viperPathLastPoint = { x, y };
      this.viperPathStartPoint = { x, y };
    }
    this.ignoreShield = type === 'red';
    
    this.velocityX = Math.cos(angle) * this.speed;
    this.velocityY = Math.sin(angle) * this.speed;
    
    let color: number;
    if (type === 'viper') {
      color = GAME_CONFIG.VIPER_COLOR;
    } else if (type === 'red') {
      color = GAME_CONFIG.RED_BULLET_COLOR;
    } else {
      color = isPlayerBullet ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_BULLET_COLOR;
    }
    
    const radius = type === 'meteora' ? GAME_CONFIG.BULLET_RADIUS * 1.3 :
                   type === 'viper' ? GAME_CONFIG.BULLET_RADIUS * 0.9 :
                   type === 'red' ? GAME_CONFIG.BULLET_RADIUS * 1.4 :
                   GAME_CONFIG.BULLET_RADIUS;
    
    this.sprite = scene.add.circle(x, y, radius, color);
    const strokeColor = type === 'red' ? GAME_CONFIG.RED_BULLET_STROKE_COLOR : 0xffffff;
    this.sprite.setStrokeStyle(1, strokeColor, 0.6);
    
    // Add glow effect
    this.sprite.setAlpha(0.9);
  }
  
  hold() {
    this.isHeld = true;
    this.releaseScheduled = false;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  releaseTowards(targetX: number, targetY: number) {
    if (!this.active) return;
    this.isHeld = false;
    this.releaseScheduled = false;
    this.angle = Math.atan2(targetY - this.y, targetX - this.x);
    this.velocityX = Math.cos(this.angle) * this.speed;
    this.velocityY = Math.sin(this.angle) * this.speed;
  }

  releaseWithAngle(angle: number) {
    if (!this.active) return;
    this.isHeld = false;
    this.releaseScheduled = false;
    this.angle = angle;
    this.velocityX = Math.cos(this.angle) * this.speed;
    this.velocityY = Math.sin(this.angle) * this.speed;
  }

  update(delta: number, _mouseX?: number, _mouseY?: number) {
    if (!this.active) return;
    
    if (this.isHeld) {
      this.sprite.setPosition(this.x, this.y);
      return;
    }

    const dt = delta / 1000;
    
    // Viper path behavior
    if (this.type === 'viper') {
      if (this.scene.time.now - this.createdAt > GAME_CONFIG.VIPER_LIFETIME) {
        this.destroy();
        return;
      }
      if (this.viperPathPoints && !this.viperPathComplete) {
        this.followViperPath(dt);
      } else {
        this.x += this.velocityX * dt;
        this.y += this.velocityY * dt;
      }

      this.trailTimer += delta;
      if (this.trailTimer > 30) {
        this.trailTimer = 0;
        this.createTrailParticle();
      }
    } else {
      this.x += this.velocityX * dt;
      this.y += this.velocityY * dt;
    }
    
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

  private followViperPath(dt: number) {
    if (!this.viperPathPoints) return;
    let remaining = this.speed * dt;
    while (remaining > 0 && !this.viperPathComplete) {
      const target = this.viperPathPoints[this.viperPathIndex];
      if (!target) {
        this.viperPathComplete = true;
        return;
      }
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= remaining) {
        this.x = target.x;
        this.y = target.y;
        remaining -= distance;
        this.viperPathLastPoint = target;
        this.viperPathIndex += 1;
        if (this.viperPathIndex >= this.viperPathPoints.length) {
          this.viperPathComplete = true;
          const prevPoint =
            this.viperPathPoints.length > 1
              ? this.viperPathPoints[this.viperPathPoints.length - 2]
              : this.viperPathStartPoint ?? this.viperPathLastPoint ?? { x: this.x, y: this.y };
          const finalAngle = Math.atan2(this.y - prevPoint.y, this.x - prevPoint.x);
          this.angle = finalAngle;
          this.velocityX = Math.cos(this.angle) * this.speed;
          this.velocityY = Math.sin(this.angle) * this.speed;
          break;
        }
      } else {
        const ratio = remaining / distance;
        this.x += dx * ratio;
        this.y += dy * ratio;
        this.angle = Math.atan2(dy, dx);
        this.velocityX = Math.cos(this.angle) * this.speed;
        this.velocityY = Math.sin(this.angle) * this.speed;
        remaining = 0;
      }
    }
  }
  
  private createTrailParticle() {
    const particle = this.scene.add.circle(
      this.x,
      this.y,
      3,
      GAME_CONFIG.VIPER_COLOR,
      0.6
    );
    
    this.scene.tweens.add({
      targets: particle,
      alpha: 0,
      scale: 0.3,
      duration: 200,
      onComplete: () => {
        particle.destroy();
      }
    });
  }

  getExplosionArea(): Phaser.Geom.Circle {
    return new Phaser.Geom.Circle(this.x, this.y, GAME_CONFIG.METEORA_EXPLOSION_RADIUS);
  }

  explode(): Phaser.Geom.Circle | null {
    if (!this.active || this.type !== 'meteora' || this.hasExploded) return null;
    
    this.hasExploded = true;
    const explosionArea = this.getExplosionArea();
    
    // Create explosion visual
    const explosion = this.scene.add.circle(
      explosionArea.x,
      explosionArea.y,
      explosionArea.radius,
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
    return explosionArea;
  }

  destroy() {
    this.active = false;
    this.sprite.destroy();
    // Clean up any remaining trail particles
    this.trail.forEach(p => p.destroy());
    this.trail = [];
  }

  getBounds(): Phaser.Geom.Circle {
    return new Phaser.Geom.Circle(this.x, this.y, this.sprite.radius);
  }
}
