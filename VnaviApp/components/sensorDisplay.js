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
const MAX_HISTORY = 2;
const GYROSCOPE_RATE = 525;
//Gyroscope is not polling at the supposed 200Hz, need to fix!
setUpdateIntervalForType(SensorTypes.gyroscope, GYROSCOPE_RATE);
setUpdateIntervalForType(SensorTypes.accelerometer, 500);

const SensorDisplay = (props) => {
  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [gyroscopeHistory, setGyroscopeHistory] = useState([]);
  const [angleHistory, setAngleHistory] = useState(0);

  // const gyroscopeSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
  //   setGyroscopeData({ x, y, z, timestamp });
  //   console.log(y)
  // })

  useEffect(() => {
    const accelerometerSubscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      setAccelerometerData({ x, y, z, timestamp });
    });
    const gyroscopeSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
      setGyroscopeData({ x, y, z, timestamp });
      if(props.data.length != 0){
        if(props.data[2]){
          var currentSegment = props.data[2];
          if(props.data[1] && props.data[1] === 'no door'){
            var totalAngle = 0;
            for(let rad of gyroscopeHistory){
              totalAngle += rad*(GYROSCOPE_RATE/1000);
            }
            setGyroscopeHistory([]);
            var degrees = totalAngle * (180/Math.PI);
            setAngleHistory(angleHistory + degrees);
            var clockSegments = Math.floor(angleHistory/30);
            if((currentSegment+clockSegments)%12 > 0){
              currentSegment = (currentSegment+clockSegments)%12;
            } else {
              currentSegment = (currentSegment+clockSegments)%12 + 12;
            }
            console.log("Estimation: " + currentSegment);
          } else {
            setAngleHistory(0);
          }
        }
      }
      if(gyroscopeHistory.length<MAX_HISTORY){
        var newHistory = gyroscopeHistory;
        newHistory.push(y);
        setGyroscopeHistory(newHistory);
      } else {
        var newHistory = gyroscopeHistory;
        newHistory.shift();
        newHistory.push(y);
        setGyroscopeHistory(newHistory);
      }
    }
    );

    return () => {
      accelerometerSubscription.unsubscribe();
      gyroscopeSubscription.unsubscribe();
    };
  }, [gyroscopeData]);

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