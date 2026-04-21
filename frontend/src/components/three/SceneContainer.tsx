import React, { Suspense, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import { Navbar3D } from './Navbar3D';

interface SceneContainerProps {
  children?: ReactNode;
}

export const SceneContainer = ({ children }: SceneContainerProps) => {
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, zIndex: -1 }}>
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[0, 5, 10]} fov={50} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.05} />

        {/* Lighting & Environment */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <Environment preset="city" />

        {/* 3D HUD Navigation */}
        <Navbar3D />

        {/* Basic Ground/Floor for reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
          <planeGeometry args={[100, 100]} />
          <meshStandardMaterial color="#111" roughness={0.8} metalness={0.2} />
        </mesh>
        <ContactShadows opacity={0.4} scale={20} blur={2.4} far={4.5} />

        <Suspense fallback={null}>{children}</Suspense>
      </Canvas>
    </div>
  );
};
