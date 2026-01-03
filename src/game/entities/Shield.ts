import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';

export class Shield {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Rectangle;
  public active: boolean = true;
  private createdAt: number;
  public x: number;
  public y: number;
  public angle: number;

  constructor(scene: Phaser.Scene, playerX: number, playerY: number, aimAngle: number) {
    this.scene = scene;
    this.angle = aimAngle;
    this.createdAt = scene.time.now;
    
    // Shield is placed perpendicular to aim direction, in front of player
    const shieldDistance = GAME_CONFIG.SHIELD_DISTANCE;
    this.x = playerX + Math.cos(aimAngle) * shieldDistance;
    this.y = playerY + Math.sin(aimAngle) * shieldDistance;
    
    // Width is 4x bullet diameter
    const shieldWidth = GAME_CONFIG.BULLET_RADIUS * 2 * GAME_CONFIG.SHIELD_WIDTH;
    
    // Create shield rectangle (rotated perpendicular to aim)
    this.sprite = scene.add.rectangle(
      this.x,
      this.y,
      GAME_CONFIG.SHIELD_THICKNESS,
      shieldWidth,
      GAME_CONFIG.SHIELD_COLOR,
      0.7
    );
    
    // Rotate to be perpendicular to aim direction
    // Add PI/2 to make it perpendicular
    this.sprite.setRotation(aimAngle + Math.PI / 2);
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
    glow.setRotation(aimAngle + Math.PI / 2);
    glow.setDepth(-1);
    
    // Pulsing glow animation
    scene.tweens.add({
      targets: glow,
      alpha: 0.1,
      yoyo: true,
      repeat: -1,
      duration: 150,
    });
    
    // Schedule destruction
    scene.time.delayedCall(GAME_CONFIG.SHIELD_DURATION, () => {
      if (this.active) {
        this.destroy();
      }
    });
    
    // Store glow reference for cleanup
    (this.sprite as any)._glow = glow;
  }

  update(playerX: number, playerY: number, aimAngle: number) {
    if (!this.active) return;
    
    // Update position to follow player
    const shieldDistance = GAME_CONFIG.SHIELD_DISTANCE;
    this.x = playerX + Math.cos(aimAngle) * shieldDistance;
    this.y = playerY + Math.sin(aimAngle) * shieldDistance;
    this.angle = aimAngle;
    
    this.sprite.setPosition(this.x, this.y);
    this.sprite.setRotation(aimAngle + Math.PI / 2);
    
    // Update glow position
    const glow = (this.sprite as any)._glow;
    if (glow) {
      glow.setPosition(this.x, this.y);
      glow.setRotation(aimAngle + Math.PI / 2);
    }
  }

  getBounds(): Phaser.Geom.Rectangle {
    return this.sprite.getBounds();
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
