import { Canvas, useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';

export type AssistantRobotSize = 'sm' | 'md' | 'lg' | 'xl';

const scaleBySize: Record<AssistantRobotSize, number> = {
  sm: 0.86,
  md: 1,
  lg: 1.18,
  xl: 1.42,
};

const cameraBySize: Record<AssistantRobotSize, number> = {
  sm: 35,
  md: 32,
  lg: 30,
  xl: 27,
};

const RobotFigure = ({
  size,
  animated,
}: {
  size: AssistantRobotSize;
  animated: boolean;
}) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!animated || !groupRef.current) {
      return;
    }

    const elapsed = state.clock.getElapsedTime();
    groupRef.current.rotation.y = Math.sin(elapsed * 0.9) * 0.32;
    groupRef.current.rotation.x = Math.cos(elapsed * 0.45) * 0.06;
    groupRef.current.position.y = Math.sin(elapsed * 1.25) * 0.08;
  });

  return (
    <group ref={groupRef} scale={scaleBySize[size]} position={[0, -0.08, 0]}>
      <mesh position={[0, -1.24, 0.08]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.86, 48]} />
        <meshBasicMaterial color="#4fc3f7" transparent opacity={0.16} />
      </mesh>

      <mesh position={[0, -1.02, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.92, 0.08, 18, 64]} />
        <meshStandardMaterial
          color="#29b6f6"
          emissive="#29b6f6"
          emissiveIntensity={0.5}
          roughness={0.24}
          metalness={0.42}
          transparent
          opacity={0.88}
        />
      </mesh>

      <mesh position={[0, -0.18, 0]}>
        <capsuleGeometry args={[0.52, 0.92, 10, 18]} />
        <meshStandardMaterial color="#f7fbff" roughness={0.18} metalness={0.22} />
      </mesh>

      <mesh position={[0, 0.92, 0.06]}>
        <sphereGeometry args={[0.72, 32, 32]} />
        <meshStandardMaterial color="#fbfdff" roughness={0.14} metalness={0.2} />
      </mesh>

      <mesh position={[0, 0.18, 0.56]}>
        <sphereGeometry args={[0.16, 24, 24]} />
        <meshStandardMaterial
          color="#2ec5ff"
          emissive="#2ec5ff"
          emissiveIntensity={0.8}
          roughness={0.18}
          metalness={0.45}
        />
      </mesh>

      <mesh position={[-0.23, 1.03, 0.59]} scale={[0.15, 0.22, 0.1]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color="#15253d" roughness={0.36} metalness={0.16} />
      </mesh>
      <mesh position={[0.23, 1.03, 0.59]} scale={[0.15, 0.22, 0.1]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color="#15253d" roughness={0.36} metalness={0.16} />
      </mesh>

      <mesh position={[0, 0.7, 0.63]} scale={[0.24, 0.05, 0.1]}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color="#192a44" roughness={0.36} metalness={0.1} />
      </mesh>

      <mesh position={[0, 1.76, 0]} rotation={[0, 0, 0.08]}>
        <cylinderGeometry args={[0.05, 0.06, 0.42, 18]} />
        <meshStandardMaterial color="#dfeeff" roughness={0.24} metalness={0.3} />
      </mesh>
      <mesh position={[0.06, 2.02, 0]}>
        <sphereGeometry args={[0.13, 20, 20]} />
        <meshStandardMaterial
          color="#ffb74d"
          emissive="#ffb74d"
          emissiveIntensity={0.45}
          roughness={0.26}
          metalness={0.22}
        />
      </mesh>

      <group position={[-0.72, 0.16, 0]} rotation={[0, 0, -0.42]}>
        <mesh>
          <capsuleGeometry args={[0.12, 0.58, 8, 14]} />
          <meshStandardMaterial color="#f4fbff" roughness={0.2} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.46, 0.04]}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshStandardMaterial color="#2ec5ff" roughness={0.2} metalness={0.4} />
        </mesh>
      </group>

      <group position={[0.72, 0.16, 0]} rotation={[0, 0, 0.42]}>
        <mesh>
          <capsuleGeometry args={[0.12, 0.58, 8, 14]} />
          <meshStandardMaterial color="#f4fbff" roughness={0.2} metalness={0.2} />
        </mesh>
        <mesh position={[0, -0.46, 0.04]}>
          <sphereGeometry args={[0.13, 20, 20]} />
          <meshStandardMaterial color="#2ec5ff" roughness={0.2} metalness={0.4} />
        </mesh>
      </group>

      <group position={[-0.26, -0.92, 0]} rotation={[0.2, 0, 0.08]}>
        <mesh>
          <capsuleGeometry args={[0.13, 0.38, 8, 14]} />
          <meshStandardMaterial color="#eaf5ff" roughness={0.2} metalness={0.2} />
        </mesh>
      </group>

      <group position={[0.26, -0.92, 0]} rotation={[0.2, 0, -0.08]}>
        <mesh>
          <capsuleGeometry args={[0.13, 0.38, 8, 14]} />
          <meshStandardMaterial color="#eaf5ff" roughness={0.2} metalness={0.2} />
        </mesh>
      </group>
    </group>
  );
};

export const AssistantRobotScene = ({
  size,
  animated,
}: {
  size: AssistantRobotSize;
  animated: boolean;
}) => (
  <Canvas
    className="assistant-robot-canvas"
    dpr={[1, 1.6]}
    frameloop={animated ? 'always' : 'demand'}
    camera={{ position: [0, 0.1, 5.15], fov: cameraBySize[size] }}
    gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
  >
    <ambientLight intensity={1.2} />
    <directionalLight position={[4, 4, 5]} intensity={2.2} color="#ffffff" />
    <pointLight position={[-3, 1.5, 3]} intensity={1.25} color="#5fd1ff" />
    <pointLight position={[2.2, -1.5, 2.5]} intensity={0.8} color="#8ddcff" />
    <RobotFigure size={size} animated={animated} />
  </Canvas>
);
