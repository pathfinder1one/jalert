import React from 'react';
import { Html } from '@react-three/drei';

interface PanelProps {
  children: React.ReactNode;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export const Panel3D = ({ children, position, rotation = [0, 0, 0], scale = [1, 1, 1] }: PanelProps) => {
  return (
    <group position={position} rotation={rotation} scale={scale}>
      {/* The visual backing of the panel */}
      <mesh receiveShadow>
        <planeGeometry args={[16, 9]} />
        <meshStandardMaterial
          color="#1a1a2e"
          roughness={0.1}
          metalness={0.8}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* The actual React content projected onto the plane */}
      <Html
        transform
        distanceFactor={1}
        position={[0, 0, 0.01]} // Slightly offset to avoid z-fighting
        style={{
          width: '1600px', // High res canvas
          height: '900px',
          userSelect: 'none',
          pointerEvents: 'auto',
        }}
      >
        <div className="panel-content-wrapper" style={{
          width: '100%',
          height: '100%',
          color: 'white',
          overflow: 'auto',
          background: 'transparent'
        }}>
          {children}
        </div>
      </Html>
    </group>
  );
};
