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
    speed?: number
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
      this.speed = GAME_CONFIG.RED_BULLET_SPEED;
    } else {
      this.speed = speed ?? GAME_CONFIG.BULLET_SPEED;
    }
    this.createdAt = scene.time.now;
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

  update(delta: number, mouseX?: number, mouseY?: number) {
    if (!this.active) return;
    
    if (this.isHeld) {
      this.sprite.setPosition(this.x, this.y);
      return;
    }

    const dt = delta / 1000;
    
    // Viper guided behavior
    if (this.type === 'viper' && mouseX !== undefined && mouseY !== undefined) {
      // Calculate desired angle toward mouse
      const targetAngle = Math.atan2(mouseY - this.y, mouseX - this.x);
      
      // Gradually turn toward target
      let angleDiff = targetAngle - this.angle;
      
      // Normalize angle difference to -PI to PI
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      
      // Apply turn rate
      const maxTurn = GAME_CONFIG.VIPER_TURN_RATE * dt;
      if (Math.abs(angleDiff) < maxTurn) {
        this.angle = targetAngle;
      } else {
        this.angle += Math.sign(angleDiff) * maxTurn;
      }
      
      // Update velocity based on new angle
      this.velocityX = Math.cos(this.angle) * this.speed;
      this.velocityY = Math.sin(this.angle) * this.speed;
      
      // Create trail effect
      this.trailTimer += delta;
      if (this.trailTimer > 30) {
        this.trailTimer = 0;
        this.createTrailParticle();
      }
      
      // Check lifetime
      if (this.scene.time.now - this.createdAt > GAME_CONFIG.VIPER_LIFETIME) {
        this.destroy();
        return;
      }
    }
    
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
