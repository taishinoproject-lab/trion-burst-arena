import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';

export class Player {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private aimIndicator: Phaser.GameObjects.Line;
  private slowIndicator: Phaser.GameObjects.Arc;
  private slowText: Phaser.GameObjects.Text;
  public x: number;
  public y: number;
  public angle: number = 0;
  private slowUntil = 0;
  private slowStacks = 0;
  private slowStackMultiplier = 1;
  
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

  // Mobile input reference
  private mobileInput: { moveX: number; moveY: number; aimX: number; aimY: number } | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    
    // Create player visual (triangle pointing right)
    this.body = scene.add.circle(0, 0, GAME_CONFIG.PLAYER_RADIUS, GAME_CONFIG.PLAYER_COLOR);
    this.body.setStrokeStyle(2, 0xffffff, 0.5);
    
    // Aim indicator line
    this.aimIndicator = scene.add.line(0, 0, 0, 0, 40, 0, GAME_CONFIG.BULLET_COLOR, 0.6);
    this.aimIndicator.setLineWidth(2);

    const slowRadius = GAME_CONFIG.BULLET_RADIUS * 1.4;
    this.slowIndicator = scene.add.circle(0, 0, slowRadius, GAME_CONFIG.RED_BULLET_COLOR);
    this.slowIndicator.setStrokeStyle(1, GAME_CONFIG.RED_BULLET_STROKE_COLOR, 0.7);
    this.slowIndicator.setAlpha(0.9);
    this.slowIndicator.setVisible(false);

    this.slowText = scene.add.text(0, -GAME_CONFIG.PLAYER_RADIUS - 18, '', {
      fontSize: '12px',
      color: '#ff9f43',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3,
    });
    this.slowText.setOrigin(0.5, 1);
    this.slowText.setVisible(false);

    // Container for player graphics
    this.sprite = scene.add.container(x, y, [this.body, this.aimIndicator, this.slowIndicator, this.slowText]);
    
    // Setup keyboard input
    this.keys = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  update(delta: number, mobileInput?: { moveX: number; moveY: number; aimX: number; aimY: number }) {
    const now = this.scene.time.now;
    if (now >= this.slowUntil && this.slowStacks > 0) {
      this.slowStacks = 0;
    }
    const isSlowed = now < this.slowUntil && this.slowStacks > 0;
    if (this.slowIndicator.visible !== isSlowed) {
      this.slowIndicator.setVisible(isSlowed);
    }
    const slowInfo = this.getSlowStatus(now);
    if (slowInfo.active) {
      this.slowText.setText(`SLOW x${slowInfo.stacks} ${slowInfo.remainingSeconds.toFixed(1)}s`);
      this.slowText.setVisible(true);
    } else {
      this.slowText.setVisible(false);
    }
    const speedMultiplier = this.getSpeedMultiplier(now);
    const speed = GAME_CONFIG.PLAYER_SPEED * speedMultiplier * (delta / 1000);
    
    // Handle keyboard movement
    let moveX = 0;
    let moveY = 0;
    
    if (this.keys.A.isDown) moveX -= 1;
    if (this.keys.D.isDown) moveX += 1;
    if (this.keys.W.isDown) moveY -= 1;
    if (this.keys.S.isDown) moveY += 1;
    
    // Apply mobile input if provided and no keyboard input
    if (mobileInput && moveX === 0 && moveY === 0) {
      moveX = mobileInput.moveX;
      moveY = mobileInput.moveY;
    }
    
    this.x += moveX * speed;
    this.y += moveY * speed;
    
    // Clamp to screen bounds
    const padding = GAME_CONFIG.PLAYER_RADIUS;
    this.x = Phaser.Math.Clamp(this.x, padding, GAME_CONFIG.WIDTH - padding);
    this.y = Phaser.Math.Clamp(this.y, padding + 80, GAME_CONFIG.HEIGHT - padding - 60);
    
    // Update sprite position
    this.sprite.setPosition(this.x, this.y);
    
    // Update aim direction - use mobile aim if provided and we're on mobile
    const pointer = this.scene.input.activePointer;
    const isMobileMoving = mobileInput && (mobileInput.moveX !== 0 || mobileInput.moveY !== 0);
    
    if (isMobileMoving) {
      // On mobile, aim in the direction of movement
      this.angle = Phaser.Math.Angle.Between(this.x, this.y, mobileInput.aimX, mobileInput.aimY);
    } else {
      // Use mouse for aiming on desktop
      this.angle = Phaser.Math.Angle.Between(this.x, this.y, pointer.x, pointer.y);
    }
    
    // Rotate aim indicator
    this.aimIndicator.setTo(0, 0, Math.cos(this.angle) * 40, Math.sin(this.angle) * 40);
  }

  setMobileInput(input: { moveX: number; moveY: number; aimX: number; aimY: number } | null) {
    this.mobileInput = input;
  }

  getAimDirection(): { x: number; y: number } {
    return {
      x: Math.cos(this.angle),
      y: Math.sin(this.angle),
    };
  }

  applySlow(durationMs: number, multiplier: number) {
    const now = this.scene.time.now;
    if (multiplier >= 1) {
      this.slowStacks = 0;
      this.slowUntil = 0;
      this.slowStackMultiplier = 1;
      return;
    }
    const isActive = now < this.slowUntil;
    this.slowStacks = isActive ? Math.min(this.slowStacks + 1, GAME_CONFIG.RED_BULLET_MAX_STACKS) : 1;
    this.slowUntil = now + durationMs;
    this.slowStackMultiplier = multiplier;
  }

  getBulletSpeedMultiplier(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(GAME_CONFIG.RED_BULLET_ENEMY_BULLET_SPEED_MULTIPLIER, stacks);
  }

  getSlowStatus(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    const remainingMs = Math.max(0, this.slowUntil - currentTime);
    return {
      active: stacks > 0 && remainingMs > 0,
      stacks,
      remainingSeconds: remainingMs / 1000,
    };
  }

  destroy() {
    this.sprite.destroy();
  }

  private getSlowStacks(currentTime: number) {
    return currentTime < this.slowUntil ? this.slowStacks : 0;
  }

  private getSpeedMultiplier(currentTime: number) {
    const stacks = this.getSlowStacks(currentTime);
    if (stacks === 0) return 1;
    return Math.pow(this.slowStackMultiplier, stacks);
  }
}
