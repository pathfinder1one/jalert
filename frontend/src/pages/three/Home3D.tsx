import React from 'react';
import { Panel3D } from '../../components/three/Panel3D';
import { HomePage } from '../HomePage';

export const Home3D = () => {
  return (
    <Panel3D position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]}>
      <HomePage />
    </Panel3D>
  );
};
