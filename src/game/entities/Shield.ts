import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';

export interface IncomingBullet {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

export type ShieldType = 'narrow' | 'wide';

export class Shield {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc;
  public active: boolean = true;
  public x: number;
  public y: number;
  public angle: number;
  public type: ShieldType;
  private strength: number;
  private maxStrength: number;
  private radius: number = 0;
  private distance: number = 0;

  constructor(
    scene: Phaser.Scene, 
    playerX: number, 
    playerY: number, 
    aimAngle: number,
    type: ShieldType,
    ownerRadius: number,
    _incomingBullets?: IncomingBullet[]
  ) {
    this.scene = scene;
    this.type = type;
    
    // Deploy shield based on player's facing direction
    const shieldAngle = aimAngle;
    
    this.angle = shieldAngle;
    this.maxStrength = type === 'narrow' ? GAME_CONFIG.SHIELD_NARROW_STRENGTH : GAME_CONFIG.SHIELD_WIDE_STRENGTH;
    this.strength = this.maxStrength;

    if (type === 'narrow') {
      // Shield is placed in front of player based on facing direction
      this.distance = GAME_CONFIG.SHIELD_DISTANCE;
      this.x = playerX + Math.cos(shieldAngle) * this.distance;
      this.y = playerY + Math.sin(shieldAngle) * this.distance;

      // Width is scaled by bullet diameter
      const shieldWidth = GAME_CONFIG.BULLET_RADIUS * 2 * GAME_CONFIG.SHIELD_NARROW_WIDTH;

      // Create shield rectangle (rotated to face bullet direction)
      this.sprite = scene.add.rectangle(
        this.x,
        this.y,
        GAME_CONFIG.SHIELD_THICKNESS,
        shieldWidth,
        GAME_CONFIG.SHIELD_COLOR,
        0.7
      );

      // Rotate 90 degrees from previous orientation to align with facing direction
      this.sprite.setRotation(shieldAngle);
      this.sprite.setStrokeStyle(2, 0xffffff, 0.8);

      // Add spawn animation
      this.sprite.setScale(0.1, 1);
      scene.tweens.add({
        targets: this.sprite,
        scaleX: 1,
        duration: 100,
        ease: 'Back.out',
      });

      // Add glow effect with another rectangle behind
      const glow = scene.add.rectangle(
        this.x,
        this.y,
        GAME_CONFIG.SHIELD_THICKNESS + 6,
        shieldWidth + 6,
        GAME_CONFIG.SHIELD_GLOW_COLOR,
        0.3
      );
      glow.setRotation(shieldAngle);
      glow.setDepth(-1);

      // Pulsing glow animation
      scene.tweens.add({
        targets: glow,
        alpha: 0.1,
        yoyo: true,
        repeat: -1,
        duration: 150,
      });

      // Store glow reference for cleanup
      (this.sprite as any)._glow = glow;
    } else {
      this.x = playerX;
      this.y = playerY;
      this.radius = ownerRadius + GAME_CONFIG.SHIELD_WIDE_PADDING;

      this.sprite = scene.add.circle(
        this.x,
        this.y,
        this.radius,
        GAME_CONFIG.SHIELD_COLOR,
        0.15
      );
      this.sprite.setStrokeStyle(3, GAME_CONFIG.SHIELD_COLOR, 0.7);

      const glow = scene.add.circle(
        this.x,
        this.y,
        this.radius + 6,
        GAME_CONFIG.SHIELD_GLOW_COLOR,
        0.2
      );
      glow.setDepth(-1);

      scene.tweens.add({
        targets: glow,
        alpha: 0.05,
        yoyo: true,
        repeat: -1,
        duration: 200,
      });

      (this.sprite as any)._glow = glow;
    }
  }

  update(playerX: number, playerY: number, _aimAngle: number) {
    if (!this.active) return;
    
    if (this.type === 'narrow') {
      // Shield stays at original angle
      // Only update position to follow player
      this.x = playerX + Math.cos(this.angle) * this.distance;
      this.y = playerY + Math.sin(this.angle) * this.distance;

      this.sprite.setPosition(this.x, this.y);
      // Keep original rotation (don't update based on aim)
    } else {
      this.x = playerX;
      this.y = playerY;
      this.sprite.setPosition(this.x, this.y);
    }
    
    // Update glow position
    const glow = (this.sprite as any)._glow;
    if (glow) {
      glow.setPosition(this.x, this.y);
    }
  }

  getBounds(): Phaser.Geom.Rectangle | Phaser.Geom.Circle {
    if (this.type === 'wide') {
      return new Phaser.Geom.Circle(this.x, this.y, this.radius);
    }
    return this.sprite.getBounds();
  }

  applyDamage(amount: number) {
    if (!this.active) return;
    this.strength = Math.max(0, this.strength - amount);

    const ratio = this.maxStrength === 0 ? 0 : this.strength / this.maxStrength;
    const baseAlpha = this.type === 'wide' ? 0.1 : 0.5;
    this.sprite.setAlpha(baseAlpha + ratio * 0.5);

    const glow = (this.sprite as any)._glow;
    if (glow) {
      glow.setAlpha(0.05 + ratio * 0.25);
    }

    if (this.strength <= 0) {
      this.destroy();
    }
  }

  getStrength() {
    return this.strength;
  }

  getMaxStrength() {
    return this.maxStrength;
  }

  destroy() {
    this.active = false;
    
    // Fade out animation
    const glow = (this.sprite as any)._glow;
    
    this.scene.tweens.add({
      targets: [this.sprite, glow],
      alpha: 0,
      scaleX: 0,
      duration: 100,
      onComplete: () => {
        if (glow) glow.destroy();
        this.sprite.destroy();
      },
    });
  }
}
