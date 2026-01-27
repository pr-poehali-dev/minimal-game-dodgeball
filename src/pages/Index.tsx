import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import Icon from '@/components/ui/icon';

type Vector2D = { x: number; y: number };

type Player = {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  team: 'purple' | 'blue';
  isAlive: boolean;
  isPlayer: boolean;
  hasBall: boolean;
  aiState: 'idle' | 'chase' | 'attack' | 'evade';
  aiTimer: number;
  respawnTime?: number;
  hitTime?: number;
  deathAnimation?: number;
  throwAnimation?: number;
  scale: number;
  rotation: number;
};

type Ball = {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  justThrown: boolean;
  thrownBy?: string;
  owner?: string;
  trail: Array<{ x: number; y: number; alpha: number }>;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type GameState = 'menu' | 'playing' | 'results';

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 8;
const PLAYER_MAX_SPEED = 5;
const PLAYER_ACCELERATION = 0.25;
const FRICTION = 0.92;
const BALL_FRICTION = 0.985;
const BALL_BOUNCE = 0.7;
const THROW_FORCE = 20;
const AI_THROW_COOLDOWN = 120;
const AI_REACTION_TIME = 30;
const GRAVITY = 0.5;
const RESPAWN_TIME = 5000;
const BALL_PICKUP_RADIUS = 30;

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [score, setScore] = useState({ purple: 5, blue: 5 });
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mousePosition, setMousePosition] = useState<Vector2D>({ x: 0, y: 0 });
  
  const playersRef = useRef<Player[]>([]);
  const ballsRef = useRef<Ball[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();
  const gameStartTimeRef = useRef<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const distance = (a: Vector2D, b: Vector2D) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const normalize = (v: Vector2D): Vector2D => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  };

  const initGame = useCallback((infinite: boolean) => {
    const newPlayers: Player[] = [];
    const newBalls: Ball[] = [];
    const playerTeam = Math.random() > 0.5 ? 'purple' : 'blue';

    for (let team = 0; team < 2; team++) {
      const isLeftTeam = team === 0;
      const teamColor = isLeftTeam ? 'purple' : 'blue';
      const xBase = isLeftTeam ? CANVAS_WIDTH * 0.25 : CANVAS_WIDTH * 0.75;

      for (let i = 0; i < 5; i++) {
        const isPlayerControlled = teamColor === playerTeam && i === 2;
        const player: Player = {
          id: `${teamColor}-${i}`,
          position: {
            x: xBase + (Math.random() - 0.5) * 80,
            y: CANVAS_HEIGHT * 0.2 + i * (CANVAS_HEIGHT * 0.6) / 5,
          },
          velocity: { x: 0, y: 0 },
          radius: PLAYER_RADIUS,
          team: teamColor,
          isAlive: true,
          isPlayer: isPlayerControlled,
          hasBall: true,
          aiState: 'idle',
          aiTimer: Math.random() * AI_THROW_COOLDOWN,
          scale: 1,
          rotation: 0,
        };
        newPlayers.push(player);

        const ball: Ball = {
          id: `ball-${teamColor}-${i}`,
          position: { ...player.position },
          velocity: { x: 0, y: 0 },
          radius: BALL_RADIUS,
          justThrown: false,
          owner: player.id,
          trail: [],
        };
        newBalls.push(ball);
      }
    }

    playersRef.current = newPlayers;
    ballsRef.current = newBalls;
    particlesRef.current = [];
    gameStartTimeRef.current = Date.now();
    setInfiniteMode(infinite);
    setScore({ purple: 5, blue: 5 });
    setCountdown(2);
    setGameState('playing');
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number) => {
    const particles = particlesRef.current;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const speed = 2 + Math.random() * 4;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 60,
        maxLife: 60,
        color,
        size: 3 + Math.random() * 3,
      });
    }
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      const players = playersRef.current;
      const balls = ballsRef.current;
      const elapsed = Date.now() - gameStartTimeRef.current;
      const gameStarted = elapsed >= 2000;

      if (!gameStarted) {
        const remaining = Math.ceil((2000 - elapsed) / 1000);
        if (remaining !== countdown) {
          setCountdown(remaining);
        }
      } else if (countdown !== null) {
        setCountdown(null);
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      ctx.fillStyle = '#1A1F2C';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();

      players.forEach((player) => {
        if (!player.isAlive) {
          if (infiniteMode && player.respawnTime && Date.now() > player.respawnTime) {
            player.isAlive = true;
            player.hasBall = false;
            player.respawnTime = undefined;
            player.deathAnimation = undefined;
            player.scale = 0.5;
            player.position = {
              x: player.team === 'purple' ? CANVAS_WIDTH * 0.25 : CANVAS_WIDTH * 0.75,
              y: CANVAS_HEIGHT * 0.5,
            };
            player.velocity = { x: 0, y: 0 };
            createParticles(player.position.x, player.position.y, player.team === 'purple' ? '#9b87f5' : '#0EA5E9', 15);
          }
          return;
        }

        if (player.isPlayer) {
          if (isMouseDown) {
            const dx = mousePosition.x - player.position.x;
            const dy = mousePosition.y - player.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist > 5) {
              const dir = { x: dx / dist, y: dy / dist };
              player.velocity.x += dir.x * PLAYER_ACCELERATION;
              player.velocity.y += dir.y * PLAYER_ACCELERATION;
            }
          }
        } else {
          player.aiTimer++;

          if (player.aiTimer > 60) {
            const enemies = players.filter(p => p.team !== player.team && p.isAlive);
            const incomingBalls = balls.filter(b => 
              b.justThrown && 
              b.thrownBy && 
              players.find(p => p.id === b.thrownBy)?.team !== player.team &&
              distance(b.position, player.position) < 200
            );

            if (incomingBalls.length > 0 && Math.random() < 0.3) {
              player.aiState = 'evade';
              const ball = incomingBalls[0];
              const awayDir = normalize({
                x: player.position.x - ball.position.x,
                y: player.position.y - ball.position.y,
              });
              player.velocity.x += awayDir.x * PLAYER_ACCELERATION * 1.5;
              player.velocity.y += awayDir.y * PLAYER_ACCELERATION * 1.5;
              player.aiTimer = 0;
            } else if (gameStarted && player.hasBall && enemies.length > 0 && player.aiTimer > AI_THROW_COOLDOWN) {
              player.aiState = 'attack';
              const target = enemies[Math.floor(Math.random() * enemies.length)];
              const leadTime = distance(player.position, target.position) / THROW_FORCE;
              const predictedPos = {
                x: target.position.x + target.velocity.x * leadTime * 0.5,
                y: target.position.y + target.velocity.y * leadTime * 0.5,
              };
              throwBall(player, predictedPos);
              player.aiTimer = 0;
              player.scale = 1.3;
            } else if (!player.hasBall) {
              const freeBalls = balls.filter(b => !b.owner && !b.justThrown);
              if (freeBalls.length > 0) {
                player.aiState = 'chase';
                const nearest = freeBalls.reduce((prev, curr) => 
                  distance(curr.position, player.position) < distance(prev.position, player.position) ? curr : prev
                );
                const dir = normalize({
                  x: nearest.position.x - player.position.x,
                  y: nearest.position.y - player.position.y,
                });
                player.velocity.x += dir.x * PLAYER_ACCELERATION * 0.8;
                player.velocity.y += dir.y * PLAYER_ACCELERATION * 0.8;
              } else {
                player.aiState = 'idle';
              }
            } else {
              player.aiState = 'idle';
              if (Math.random() < 0.02) {
                const randomDir = {
                  x: (Math.random() - 0.5) * 2,
                  y: (Math.random() - 0.5) * 2,
                };
                player.velocity.x += randomDir.x * PLAYER_ACCELERATION * 0.3;
                player.velocity.y += randomDir.y * PLAYER_ACCELERATION * 0.3;
              }
            }
          }
        }

        const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
        if (speed > PLAYER_MAX_SPEED) {
          player.velocity.x = (player.velocity.x / speed) * PLAYER_MAX_SPEED;
          player.velocity.y = (player.velocity.y / speed) * PLAYER_MAX_SPEED;
        }

        player.velocity.x *= FRICTION;
        player.velocity.y *= FRICTION;

        player.position.x += player.velocity.x;
        player.position.y += player.velocity.y;

        if (speed > 0.5) {
          player.rotation += speed * 0.05;
        }

        if (player.scale > 1) {
          player.scale -= 0.02;
          if (player.scale < 1) player.scale = 1;
        } else if (player.scale < 1) {
          player.scale += 0.02;
          if (player.scale > 1) player.scale = 1;
        }

        if (player.throwAnimation !== undefined) {
          player.throwAnimation--;
          if (player.throwAnimation <= 0) {
            player.throwAnimation = undefined;
          }
        }

        const halfWidth = CANVAS_WIDTH / 2;
        const minX = player.team === 'purple' ? player.radius : halfWidth + player.radius;
        const maxX = player.team === 'purple' ? halfWidth - player.radius : CANVAS_WIDTH - player.radius;

        if (player.position.x < minX) {
          player.position.x = minX;
          player.velocity.x *= -0.5;
        }
        if (player.position.x > maxX) {
          player.position.x = maxX;
          player.velocity.x *= -0.5;
        }
        if (player.position.y < player.radius) {
          player.position.y = player.radius;
          player.velocity.y *= -0.5;
        }
        if (player.position.y > CANVAS_HEIGHT - player.radius) {
          player.position.y = CANVAS_HEIGHT - player.radius;
          player.velocity.y *= -0.5;
        }
      });

      balls.forEach((ball) => {
        if (ball.owner) {
          const owner = players.find(p => p.id === ball.owner);
          if (owner && owner.isAlive) {
            ball.position.x = owner.position.x;
            ball.position.y = owner.position.y;
            ball.velocity = { x: 0, y: 0 };
          } else {
            ball.owner = undefined;
          }
        } else {
          if (ball.justThrown) {
            ball.trail.push({ x: ball.position.x, y: ball.position.y, alpha: 1 });
            if (ball.trail.length > 15) {
              ball.trail.shift();
            }
          } else {
            ball.trail = ball.trail.filter((_, i) => i > 0);
          }

          ball.trail.forEach((t, i) => {
            t.alpha -= 0.05;
          });

          ball.velocity.x *= BALL_FRICTION;
          ball.velocity.y *= BALL_FRICTION;

          ball.position.x += ball.velocity.x;
          ball.position.y += ball.velocity.y;

          if (ball.position.x - ball.radius < 0) {
            ball.position.x = ball.radius;
            ball.velocity.x *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.x + ball.radius > CANVAS_WIDTH) {
            ball.position.x = CANVAS_WIDTH - ball.radius;
            ball.velocity.x *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.y - ball.radius < 0) {
            ball.position.y = ball.radius;
            ball.velocity.y *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }
          if (ball.position.y + ball.radius > CANVAS_HEIGHT) {
            ball.position.y = CANVAS_HEIGHT - ball.radius;
            ball.velocity.y *= -BALL_BOUNCE;
            ball.justThrown = false;
            createParticles(ball.position.x, ball.position.y, '#FFFFFF', 8);
          }

          const speed = Math.sqrt(ball.velocity.x ** 2 + ball.velocity.y ** 2);
          if (speed < 0.5) {
            ball.velocity = { x: 0, y: 0 };
            ball.justThrown = false;
          }

          players.forEach((player) => {
            if (!player.isAlive) return;

            const dist = distance(ball.position, player.position);
            
            if (ball.justThrown && ball.thrownBy !== player.id) {
              const thrower = players.find(p => p.id === ball.thrownBy);
              if (thrower && thrower.team !== player.team && dist < ball.radius + player.radius) {
                player.isAlive = false;
                player.hitTime = Date.now();
                player.deathAnimation = 0;
                player.respawnTime = infiniteMode ? Date.now() + RESPAWN_TIME : undefined;
                
                const hitColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
                createParticles(player.position.x, player.position.y, hitColor, 20);
                createParticles(ball.position.x, ball.position.y, '#FF6B6B', 10);
                
                const dx = ball.position.x - player.position.x;
                const dy = ball.position.y - player.position.y;
                const collisionDist = Math.sqrt(dx * dx + dy * dy);
                const nx = dx / collisionDist;
                const ny = dy / collisionDist;
                
                const relativeVelocity = {
                  x: ball.velocity.x - player.velocity.x,
                  y: ball.velocity.y - player.velocity.y,
                };
                
                const velocityAlongNormal = relativeVelocity.x * nx + relativeVelocity.y * ny;
                
                ball.velocity.x = ball.velocity.x - 2 * velocityAlongNormal * nx;
                ball.velocity.y = ball.velocity.y - 2 * velocityAlongNormal * ny;
                ball.velocity.x *= BALL_BOUNCE;
                ball.velocity.y *= BALL_BOUNCE;
                
                ball.justThrown = false;
                ball.thrownBy = undefined;
              }
            } else if (!ball.justThrown && !ball.owner && !player.hasBall && dist < BALL_PICKUP_RADIUS) {
              ball.owner = player.id;
              player.hasBall = true;
              player.scale = 1.2;
              createParticles(ball.position.x, ball.position.y, player.team === 'purple' ? '#9b87f5' : '#0EA5E9', 8);
            }
          });
        }
      });

      const purpleAlive = players.filter(p => p.team === 'purple' && p.isAlive).length;
      const blueAlive = players.filter(p => p.team === 'blue' && p.isAlive).length;
      setScore({ purple: purpleAlive, blue: blueAlive });

      if (!infiniteMode) {
        const playerAlive = players.find(p => p.isPlayer)?.isAlive ?? false;
        if (purpleAlive === 0 || blueAlive === 0 || !playerAlive) {
          setGameState('results');
          return;
        }
      } else {
        const playerAlive = players.find(p => p.isPlayer)?.isAlive ?? false;
        if (!playerAlive) {
          setGameState('results');
          return;
        }
      }

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.95;
        p.vy *= 0.95;
        p.life--;

        if (p.life <= 0) {
          particles.splice(i, 1);
        } else {
          const alpha = p.life / p.maxLife;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      players.forEach((player) => {
        if (!player.isAlive) {
          if (player.deathAnimation !== undefined && player.deathAnimation < 30) {
            player.deathAnimation++;
            const progress = player.deathAnimation / 30;
            const scale = 1 - progress;
            const alpha = 1 - progress;
            
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 20 * (1 - progress);
            ctx.shadowColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
            ctx.fillStyle = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
            ctx.beginPath();
            ctx.arc(player.position.x, player.position.y, player.radius * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
          }
          return;
        }

        if (player.hitTime && Date.now() - player.hitTime < 200) {
          const flashProgress = (Date.now() - player.hitTime) / 200;
          ctx.globalAlpha = 1 - flashProgress * 0.5;
        }

        ctx.save();
        ctx.translate(player.position.x, player.position.y);
        ctx.scale(player.scale, player.scale);
        ctx.rotate(player.rotation);

        ctx.shadowBlur = 15;
        ctx.shadowColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
        ctx.fillStyle = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
        ctx.beginPath();
        ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (player.isPlayer) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, player.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (player.hasBall) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.beginPath();
          ctx.arc(0, 0, player.radius * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      });

      balls.forEach((ball) => {
        if (ball.owner) return;

        ball.trail.forEach((t, i) => {
          const alpha = t.alpha * (i / ball.trail.length);
          if (alpha > 0) {
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#FF6B6B';
            ctx.beginPath();
            ctx.arc(t.x, t.y, ball.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;

        ctx.shadowBlur = ball.justThrown ? 15 : 10;
        ctx.shadowColor = ball.justThrown ? '#FF6B6B' : '#FFFFFF';
        ctx.fillStyle = ball.justThrown ? '#FF6B6B' : '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      if (!gameStarted && countdown !== null) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        ctx.font = 'bold 120px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const scale = 1 + (1 - (elapsed % 1000) / 1000) * 0.3;
        ctx.save();
        ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.scale(scale, scale);
        
        ctx.shadowBlur = 30;
        ctx.shadowColor = '#9b87f5';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(countdown.toString(), 0, 0);
        ctx.shadowBlur = 0;
        
        ctx.restore();
        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, infiniteMode, isMouseDown, mousePosition]);

  const throwBall = (player: Player, target: Vector2D) => {
    const balls = ballsRef.current;
    balls.forEach((ball) => {
      if (ball.owner === player.id) {
        const dir = normalize({
          x: target.x - player.position.x,
          y: target.y - player.position.y,
        });
        ball.owner = undefined;
        ball.velocity = { x: dir.x * THROW_FORCE, y: dir.y * THROW_FORCE };
        ball.justThrown = true;
        ball.thrownBy = player.id;
        ball.trail = [];
        player.hasBall = false;
        player.throwAnimation = 10;
        player.scale = 0.8;
        
        createParticles(player.position.x + dir.x * 20, player.position.y + dir.y * 20, '#FFFFFF', 6);
      }
    });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsMouseDown(true);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const elapsed = Date.now() - gameStartTimeRef.current;
    const gameStarted = elapsed >= 2000;
    if (!gameStarted) return;

    const clickPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const players = playersRef.current;
    const player = players.find(p => p.isPlayer && p.isAlive);
    if (!player || !player.hasBall) return;

    const clickedPlayer = players.find(
      p => p.team !== player.team && p.isAlive && distance(p.position, clickPos) < p.radius + 20
    );

    if (clickedPlayer) {
      throwBall(player, clickedPlayer.position);
    } else {
      throwBall(player, clickPos);
    }
  };

  if (gameState === 'menu') {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-8 animate-fade-in">
          <h1 className="text-7xl font-bold text-white tracking-tight">ВЫШИБАЛЫ</h1>
          <p className="text-xl text-muted-foreground">Минималистичная игра в додж-бол</p>
          <div className="flex flex-col gap-4 mt-12">
            <Button
              size="lg"
              className="text-lg px-12 py-6 bg-primary hover:bg-primary/90"
              onClick={() => initGame(false)}
            >
              Начать игру
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-12 py-6"
              onClick={() => initGame(true)}
            >
              Бесконечный режим
            </Button>
          </div>
          <div className="mt-12 text-sm text-muted-foreground space-y-2">
            <p>Зажми ЛКМ для движения</p>
            <p>Кликни на противника чтобы бросить мяч</p>
          </div>
        </div>
      </div>
    );
  }

  if (gameState === 'results') {
    const players = playersRef.current;
    const player = players.find(p => p.isPlayer);
    const playerWon = player?.isAlive && score[player.team] > 0;

    return (
      <div className="w-screen h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-8 animate-fade-in">
          <h1 className="text-7xl font-bold text-white">
            {playerWon ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ'}
          </h1>
          <p className="text-2xl text-muted-foreground">
            Счёт: {score.purple} - {score.blue}
          </p>
          <div className="flex gap-4 mt-12">
            <Button
              size="lg"
              className="text-lg px-12 py-6 bg-primary hover:bg-primary/90"
              onClick={() => initGame(infiniteMode)}
            >
              <Icon name="RotateCcw" className="mr-2" />
              Заново
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="text-lg px-12 py-6"
              onClick={() => setGameState('menu')}
            >
              В меню
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="absolute top-0 left-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onClick={handleCanvasClick}
      />
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 flex items-center gap-8 text-white text-2xl font-bold">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[#9b87f5]"></div>
          <span>{score.purple}</span>
        </div>
        <span className="text-muted-foreground">VS</span>
        <div className="flex items-center gap-2">
          <span>{score.blue}</span>
          <div className="w-6 h-6 rounded-full bg-[#0EA5E9]"></div>
        </div>
      </div>
      {infiniteMode && (
        <div className="absolute top-8 right-8 text-white text-sm bg-muted px-4 py-2 rounded-lg">
          Бесконечный режим
        </div>
      )}
    </div>
  );
}