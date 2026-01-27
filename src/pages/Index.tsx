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
  targetPosition?: Vector2D;
  respawnTime?: number;
};

type Ball = {
  id: string;
  position: Vector2D;
  velocity: Vector2D;
  radius: number;
  justThrown: boolean;
  thrownBy?: string;
  owner?: string;
};

type GameState = 'menu' | 'playing' | 'results';

const CANVAS_WIDTH = window.innerWidth;
const CANVAS_HEIGHT = window.innerHeight;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 8;
const PLAYER_SPEED = 5;
const BALL_DAMPING = 0.98;
const BALL_BOUNCE = 0.7;
const THROW_FORCE = 15;
const RESPAWN_TIME = 10000;
const PLAYER_ACCELERATION = 0.15;

export default function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('menu');
  const [players, setPlayers] = useState<Player[]>([]);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [mousePosition, setMousePosition] = useState<Vector2D>({ x: 0, y: 0 });
  const [infiniteMode, setInfiniteMode] = useState(false);
  const [score, setScore] = useState({ purple: 5, blue: 5 });
  const animationFrameRef = useRef<number>();

  const initGame = useCallback((infinite: boolean) => {
    const newPlayers: Player[] = [];
    const newBalls: Ball[] = [];
    const playerTeam = Math.random() > 0.5 ? 'purple' : 'blue';

    for (let team = 0; team < 2; team++) {
      const isLeftTeam = team === 0;
      const teamColor = isLeftTeam ? 'purple' : 'blue';
      const xBase = isLeftTeam ? CANVAS_WIDTH * 0.2 : CANVAS_WIDTH * 0.8;

      for (let i = 0; i < 5; i++) {
        const isPlayerControlled = teamColor === playerTeam && i === 2;
        const player: Player = {
          id: `${teamColor}-${i}`,
          position: {
            x: xBase + (Math.random() - 0.5) * 100,
            y: CANVAS_HEIGHT * 0.3 + i * 100,
          },
          velocity: { x: 0, y: 0 },
          radius: PLAYER_RADIUS,
          team: teamColor,
          isAlive: true,
          isPlayer: isPlayerControlled,
          hasBall: true,
        };
        newPlayers.push(player);

        const ball: Ball = {
          id: `ball-${teamColor}-${i}`,
          position: { ...player.position },
          velocity: { x: 0, y: 0 },
          radius: BALL_RADIUS,
          justThrown: false,
          owner: player.id,
        };
        newBalls.push(ball);
      }
    }

    setPlayers(newPlayers);
    setBalls(newBalls);
    setInfiniteMode(infinite);
    setScore({ purple: 5, blue: 5 });
    setGameState('playing');
  }, []);

  const distance = (a: Vector2D, b: Vector2D) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const normalize = (v: Vector2D): Vector2D => {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
  };

  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gameLoop = () => {
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.fillStyle = '#1A1F2C';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 0);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT);
      ctx.stroke();

      const updatedPlayers = players.map((player) => {
        if (!player.isAlive) {
          if (infiniteMode && player.respawnTime && Date.now() > player.respawnTime) {
            return {
              ...player,
              isAlive: true,
              hasBall: false,
              respawnTime: undefined,
              position: {
                x: player.team === 'purple' ? CANVAS_WIDTH * 0.2 : CANVAS_WIDTH * 0.8,
                y: CANVAS_HEIGHT * 0.5,
              },
            };
          }
          return player;
        }

        const newPlayer = { ...player };

        if (player.isPlayer && isMouseDown) {
          const dir = normalize({
            x: mousePosition.x - player.position.x,
            y: mousePosition.y - player.position.y,
          });
          const targetVelocity = { x: dir.x * PLAYER_SPEED, y: dir.y * PLAYER_SPEED };
          newPlayer.velocity = {
            x: player.velocity.x + (targetVelocity.x - player.velocity.x) * PLAYER_ACCELERATION,
            y: player.velocity.y + (targetVelocity.y - player.velocity.y) * PLAYER_ACCELERATION,
          };
        } else if (!player.isPlayer) {
          const nearestBall = balls
            .filter((b) => !b.owner || b.owner === player.id)
            .sort((a, b) => distance(a.position, player.position) - distance(b.position, player.position))[0];

          if (nearestBall && !player.hasBall && distance(nearestBall.position, player.position) > 50) {
            const dir = normalize({
              x: nearestBall.position.x - player.position.x,
              y: nearestBall.position.y - player.position.y,
            });
            const targetVelocity = { x: dir.x * PLAYER_SPEED * 0.6, y: dir.y * PLAYER_SPEED * 0.6 };
            newPlayer.velocity = {
              x: player.velocity.x + (targetVelocity.x - player.velocity.x) * 0.1,
              y: player.velocity.y + (targetVelocity.y - player.velocity.y) * 0.1,
            };
          } else {
            newPlayer.velocity = { x: player.velocity.x * 0.85, y: player.velocity.y * 0.85 };
          }

          if (player.hasBall && Math.random() < 0.02) {
            const enemies = players.filter((p) => p.team !== player.team && p.isAlive);
            if (enemies.length > 0) {
              const target = enemies[Math.floor(Math.random() * enemies.length)];
              throwBallAt(player, target.position);
            }
          }
        } else {
          newPlayer.velocity = { x: player.velocity.x * 0.85, y: player.velocity.y * 0.85 };
        }

        newPlayer.position = {
          x: Math.max(
            player.radius,
            Math.min(
              player.team === 'purple' ? CANVAS_WIDTH / 2 - player.radius : CANVAS_WIDTH / 2 + player.radius,
              player.position.x + newPlayer.velocity.x
            )
          ),
          y: Math.max(player.radius, Math.min(CANVAS_HEIGHT - player.radius, player.position.y + newPlayer.velocity.y)),
        };

        return newPlayer;
      });

      const updatedBalls = balls.map((ball) => {
        const newBall = { ...ball };

        if (ball.owner) {
          const owner = updatedPlayers.find((p) => p.id === ball.owner);
          if (owner && owner.isAlive) {
            newBall.position = { ...owner.position };
            newBall.velocity = { x: 0, y: 0 };
          } else {
            newBall.owner = undefined;
          }
        } else {
          newBall.position = {
            x: ball.position.x + ball.velocity.x,
            y: ball.position.y + ball.velocity.y,
          };

          if (newBall.position.x - ball.radius < 0 || newBall.position.x + ball.radius > CANVAS_WIDTH) {
            newBall.velocity.x *= -BALL_BOUNCE;
            newBall.position.x = Math.max(ball.radius, Math.min(CANVAS_WIDTH - ball.radius, newBall.position.x));
            newBall.justThrown = false;
          }

          if (newBall.position.y - ball.radius < 0 || newBall.position.y + ball.radius > CANVAS_HEIGHT) {
            newBall.velocity.y *= -BALL_BOUNCE;
            newBall.position.y = Math.max(ball.radius, Math.min(CANVAS_HEIGHT - ball.radius, newBall.position.y));
            newBall.justThrown = false;
          }

          newBall.velocity = {
            x: ball.velocity.x * BALL_DAMPING,
            y: ball.velocity.y * BALL_DAMPING,
          };

          if (Math.abs(newBall.velocity.x) < 0.1 && Math.abs(newBall.velocity.y) < 0.1) {
            newBall.velocity = { x: 0, y: 0 };
          }
        }

        updatedPlayers.forEach((player) => {
          if (!player.isAlive) return;

          const dist = distance(newBall.position, player.position);
          if (dist < ball.radius + player.radius) {
            if (newBall.justThrown && newBall.thrownBy !== player.id && !newBall.owner) {
              const thrower = updatedPlayers.find((p) => p.id === newBall.thrownBy);
              if (thrower && thrower.team !== player.team) {
                player.isAlive = false;
                player.respawnTime = infiniteMode ? Date.now() + RESPAWN_TIME : undefined;
                newBall.justThrown = false;
                newBall.thrownBy = undefined;
              }
            } else if (!newBall.justThrown && !player.hasBall && !newBall.owner) {
              newBall.owner = player.id;
              player.hasBall = true;
            }
          }
        });

        return newBall;
      });

      setPlayers(updatedPlayers);
      setBalls(updatedBalls);

      const purpleAlive = updatedPlayers.filter((p) => p.team === 'purple' && p.isAlive).length;
      const blueAlive = updatedPlayers.filter((p) => p.team === 'blue' && p.isAlive).length;
      setScore({ purple: purpleAlive, blue: blueAlive });

      if (!infiniteMode) {
        const playerAlive = updatedPlayers.find((p) => p.isPlayer)?.isAlive ?? false;
        if (purpleAlive === 0 || blueAlive === 0 || !playerAlive) {
          setGameState('results');
          return;
        }
      } else {
        const playerAlive = updatedPlayers.find((p) => p.isPlayer)?.isAlive ?? false;
        if (!playerAlive) {
          setGameState('results');
          return;
        }
      }

      updatedPlayers.forEach((player) => {
        if (!player.isAlive) return;

        ctx.shadowBlur = 15;
        ctx.shadowColor = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
        ctx.fillStyle = player.team === 'purple' ? '#9b87f5' : '#0EA5E9';
        ctx.beginPath();
        ctx.arc(player.position.x, player.position.y, player.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (player.isPlayer) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(player.position.x, player.position.y, player.radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      updatedBalls.forEach((ball) => {
        if (ball.owner) return;

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#FFFFFF';
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(ball.position.x, ball.position.y, ball.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [gameState, players, balls, isMouseDown, mousePosition, infiniteMode]);

  const throwBallAt = (player: Player, target: Vector2D) => {
    setBalls((prevBalls) =>
      prevBalls.map((ball) => {
        if (ball.owner === player.id) {
          const dir = normalize({
            x: target.x - player.position.x,
            y: target.y - player.position.y,
          });
          return {
            ...ball,
            owner: undefined,
            velocity: { x: dir.x * THROW_FORCE, y: dir.y * THROW_FORCE },
            justThrown: true,
            thrownBy: player.id,
          };
        }
        return ball;
      })
    );

    setPlayers((prevPlayers) =>
      prevPlayers.map((p) => (p.id === player.id ? { ...p, hasBall: false } : p))
    );
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

    const clickPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const player = players.find((p) => p.isPlayer && p.isAlive);
    if (!player || !player.hasBall) return;

    const clickedPlayer = players.find(
      (p) =>
        p.team !== player.team &&
        p.isAlive &&
        distance(p.position, clickPos) < p.radius
    );

    if (clickedPlayer) {
      throwBallAt(player, clickedPlayer.position);
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
    const player = players.find((p) => p.isPlayer);
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
    <div className="relative w-screen h-screen overflow-hidden no-select">
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