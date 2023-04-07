import React, { useState, useEffect } from 'react';
import Tts from 'react-native-tts';
import { View, Text } from 'react-native';
import { LogBox } from 'react-native';

import {
  accelerometer,
  gyroscope,
  setUpdateIntervalForType,
  SensorTypes,
  magnetometer
} from "react-native-sensors";
import { map, filter } from "rxjs/operators";
const GYROSCOPE_RATE = 50;
const MAX_HISTORY = 1000;
//Gyroscope is not polling at the supposed 20Hz, need to fix!
setUpdateIntervalForType(SensorTypes.gyroscope, GYROSCOPE_RATE);
setUpdateIntervalForType(SensorTypes.accelerometer, 50);
var count = 100;

const SensorDisplay = (props) => {

  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [angleHistory, setAngleHistory] = useState(0);
  const [gyroscopeHistory, setGyroscopeHistory] = useState(0);

  // const gyroscopeSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
  //   setGyroscopeData({ x, y, z, timestamp });
  //   console.log(y)
  // })

  useEffect(() => {
    
    // console.log(count);
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
            totalAngle += gyroscopeHistory*(GYROSCOPE_RATE/1000);
            setGyroscopeHistory(0);
            totalAngle += y*(GYROSCOPE_RATE/1000);
            var degrees = 3 * totalAngle * (180/Math.PI);
            setAngleHistory(angleHistory + degrees);
            var clockSegments = Math.floor(angleHistory/30);
            if((currentSegment+clockSegments)%12 > 0){
              currentSegment = (currentSegment+clockSegments)%12;
            } else {
              currentSegment = (currentSegment+clockSegments)%12 + 12;
            }
            console.log("Estimation: " + currentSegment);
            count++;
            if(count >= 60){
              if(count >= 100){
                Tts.stop();
                Tts.speak("Door lost, calculating position");
                // Tts.speak("Door last seen at " + currentSegment.toString() + "o'clock");
              } else {
                Tts.speak("Door last seen at " + currentSegment.toString() + "o'clock");
              }
              count = 0;
            }
          } else {
            setAngleHistory(0);
            setGyroscopeHistory(gyroscopeHistory+y);
            console.log(gyroscopeHistory);
            count = 100;
          }
        }
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