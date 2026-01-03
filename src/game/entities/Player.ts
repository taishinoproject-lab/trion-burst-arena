import Phaser from 'phaser';
import { GAME_CONFIG } from '../constants';

export class Player {
  private scene: Phaser.Scene;
  public sprite: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Arc;
  private aimIndicator: Phaser.GameObjects.Line;
  public x: number;
  public y: number;
  public angle: number = 0;
  
  private keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };

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
    
    // Container for player graphics
    this.sprite = scene.add.container(x, y, [this.body, this.aimIndicator]);
    
    // Setup keyboard input
    this.keys = {
      W: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
  }

  update(delta: number) {
    const speed = GAME_CONFIG.PLAYER_SPEED * (delta / 1000);
    
    // Handle movement
    if (this.keys.A.isDown) {
      this.x -= speed;
    }
    if (this.keys.D.isDown) {
      this.x += speed;
    }
    if (this.keys.W.isDown) {
      this.y -= speed;
    }
    if (this.keys.S.isDown) {
      this.y += speed;
    }
    
    // Clamp to screen bounds
    const padding = GAME_CONFIG.PLAYER_RADIUS;
    this.x = Phaser.Math.Clamp(this.x, padding, GAME_CONFIG.WIDTH - padding);
    this.y = Phaser.Math.Clamp(this.y, padding + 80, GAME_CONFIG.HEIGHT - padding - 60);
    
    // Update sprite position
    this.sprite.setPosition(this.x, this.y);
    
    // Update aim direction based on mouse
    const pointer = this.scene.input.activePointer;
    this.angle = Phaser.Math.Angle.Between(this.x, this.y, pointer.x, pointer.y);
    
    // Rotate aim indicator
    this.aimIndicator.setTo(0, 0, Math.cos(this.angle) * 40, Math.sin(this.angle) * 40);
  }

  getAimDirection(): { x: number; y: number } {
    return {
      x: Math.cos(this.angle),
      y: Math.sin(this.angle),
    };
  }

  destroy() {
    this.sprite.destroy();
  }
}
