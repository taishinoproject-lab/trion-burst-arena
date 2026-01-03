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
  
  // Viper-specific properties
  private angle: number;
  private speed: number;
  private createdAt: number;
  private trail: Phaser.GameObjects.Arc[] = [];
  private trailTimer: number = 0;
  
  // Divide-specific properties
  private isDividing: boolean = false;
  private divideCount: number = 0;
  private hasDivided: boolean = false;
  private startX: number;
  private startY: number;
  private onDivide?: (bullets: Bullet[]) => void;
  public isHeld: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    angle: number,
    type: BulletType,
    isPlayerBullet: boolean,
    damage: number,
    speed: number = GAME_CONFIG.BULLET_SPEED,
    isDividing: boolean = false,
    divideCount: number = 0
  ) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.startX = x;
    this.startY = y;
    this.type = type;
    this.isPlayerBullet = isPlayerBullet;
    this.damage = damage;
    this.angle = angle;
    this.speed = type === 'viper' ? GAME_CONFIG.VIPER_SPEED : speed;
    this.createdAt = scene.time.now;
    this.isDividing = isDividing;
    this.divideCount = divideCount;
    
    this.velocityX = Math.cos(angle) * this.speed;
    this.velocityY = Math.sin(angle) * this.speed;
    
    let color: number;
    if (type === 'viper') {
      color = GAME_CONFIG.VIPER_COLOR;
    } else {
      color = isPlayerBullet ? GAME_CONFIG.BULLET_COLOR : GAME_CONFIG.BOSS_BULLET_COLOR;
    }
    
    const radius = type === 'meteora' ? GAME_CONFIG.BULLET_RADIUS * 1.3 : 
                   type === 'viper' ? GAME_CONFIG.BULLET_RADIUS * 0.9 : 
                   GAME_CONFIG.BULLET_RADIUS;
    
    this.sprite = scene.add.circle(x, y, radius, color);
    this.sprite.setStrokeStyle(1, 0xffffff, 0.5);
    
    // Add glow effect
    this.sprite.setAlpha(0.9);
  }
  
  setOnDivide(callback: (bullets: Bullet[]) => void) {
    this.onDivide = callback;
  }

  hold() {
    this.isHeld = true;
    this.velocityX = 0;
    this.velocityY = 0;
  }

  releaseTowards(targetX: number, targetY: number) {
    if (!this.active) return;
    this.isHeld = false;
    this.angle = Math.atan2(targetY - this.y, targetX - this.x);
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
    
    // Check for divide trigger (after traveling certain distance)
    if (this.isDividing && !this.hasDivided) {
      const traveled = Phaser.Math.Distance.Between(this.startX, this.startY, this.x, this.y);
      if (traveled > 60) { // Divide after 60px
        this.performDivide();
        return;
      }
    }
    
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
  
  private performDivide() {
    this.hasDivided = true;
    
    // Create split effect visual
    this.createDivideEffect();
    
    // Create divided bullets
    const newBullets: Bullet[] = [];
    const count = this.divideCount;
    const spread = GAME_CONFIG.ASTEROID_DIVIDE_SPREAD;
    
    for (let i = 0; i < count; i++) {
      const offsetAngle = spread * (i - (count - 1) / 2);
      const bullet = new Bullet(
        this.scene,
        this.x,
        this.y,
        this.angle + offsetAngle,
        'asteroid',
        this.isPlayerBullet,
        this.damage
      );
      // Make divided bullets slightly smaller
      bullet.sprite.setRadius(GAME_CONFIG.BULLET_RADIUS * 0.75);
      bullet.hold();
      newBullets.push(bullet);
    }
    
    // Callback to add bullets to scene
    if (this.onDivide) {
      this.onDivide(newBullets);
    }
    
    // Destroy original bullet
    this.destroy();
  }
  
  private createDivideEffect() {
    // Flash effect at divide point
    const flash = this.scene.add.circle(this.x, this.y, 15, GAME_CONFIG.BULLET_COLOR, 0.8);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.5,
      duration: 150,
      ease: 'Power2',
      onComplete: () => flash.destroy()
    });
    
    // Create splitting lines emanating from divide point
    const count = this.divideCount;
    const spread = GAME_CONFIG.ASTEROID_DIVIDE_SPREAD;
    
    for (let i = 0; i < count; i++) {
      const offsetAngle = spread * (i - (count - 1) / 2);
      const lineAngle = this.angle + offsetAngle;
      
      const lineLength = 25;
      const endX = this.x + Math.cos(lineAngle) * lineLength;
      const endY = this.y + Math.sin(lineAngle) * lineLength;
      
      const graphics = this.scene.add.graphics();
      graphics.lineStyle(2, GAME_CONFIG.BULLET_COLOR, 0.9);
      graphics.moveTo(this.x, this.y);
      graphics.lineTo(endX, endY);
      graphics.strokePath();
      
      this.scene.tweens.add({
        targets: graphics,
        alpha: 0,
        duration: 200,
        onComplete: () => graphics.destroy()
      });
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
    // Clean up any remaining trail particles
    this.trail.forEach(p => p.destroy());
    this.trail = [];
  }

  getBounds(): Phaser.Geom.Circle {
    return new Phaser.Geom.Circle(this.x, this.y, GAME_CONFIG.BULLET_RADIUS);
  }
}
