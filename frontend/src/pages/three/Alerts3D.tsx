import React from 'react';
import { Panel3D } from '../../components/three/Panel3D';
import { AlertsPage } from '../AlertsPage';

export const Alerts3D = () => {
  return (
    <Panel3D position={[15, 0, -5]} rotation={[0, -Math.PI / 6, 0]} scale={[1, 1, 1]}>
      <AlertsPage />
    </Panel3D>
  );
};
