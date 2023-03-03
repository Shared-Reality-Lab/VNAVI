import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import {
  accelerometer,
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes,
  magnetometer
} from "react-native-sensors";
import { map, filter } from "rxjs/operators";

const SensorDisplay = () => {
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });

  useEffect(() => {
    const accelerometerSubscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      setAccelerometerData({ x, y, z, timestamp });
    });
    const gyroscopeSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
      setGyroscopeData({ x, y, z, timestamp });
    });

    return () => {
      accelerometerSubscription.unsubscribe();
      gyroscopeSubscription.unsubscribe();
    };
  }, []);

  return (
    <View style={{ position:'absolute', backgroundColor: 'rgba(255,255,255,0.2)' }}>
        <Text>Accelerometer:</Text>
        <Text>x: {accelerometerData.x.toFixed(2)}</Text>
        <Text>y: {accelerometerData.y.toFixed(2)}</Text>
        <Text>z: {accelerometerData.z.toFixed(2)}</Text>

        <Text>Gyroscope:</Text>
        <Text>x: {gyroscopeData.x.toFixed(2)}</Text>
        <Text>y: {gyroscopeData.y.toFixed(2)}</Text>
        <Text>z: {gyroscopeData.z.toFixed(2)}</Text>
    </View>
  );
};

export default SensorDisplay;