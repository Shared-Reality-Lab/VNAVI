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



// Function to calculate linear acceleration after removing gravity
const calculateLinearAcceleration = (accelData, pitch, roll) => {
  // Calculate the components of gravity along the axes
  const gravityX = Math.sin(roll); // Component of gravity along the x-axis
  const gravityY = Math.sin(pitch); // Component of gravity along the y-axis
  const gravityZ = Math.cos(roll) * Math.cos(pitch); // Component of gravity along the z-axis

  // Subtract gravity components to get linear acceleration
  const linearAccX = accelData.x - gravityX;
  const linearAccY = accelData.y - gravityY;
  const linearAccZ = accelData.z - gravityZ;

  return { x: linearAccX, y: linearAccY, z: linearAccZ };
};


const SensorDisplay = (props) => {

  const [accelerometerData, setAccelerometerData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [gyroscopeData, setGyroscopeData] = useState({ x: 0, y: 0, z: 0, timestamp: 0 });
  const [angleHistory, setAngleHistory] = useState(0);
  const [gyroscopeHistory, setGyroscopeHistory] = useState(0);
  const [distanceTraveled, setDistanceTraveled] = useState(0);
  const [xVelocity, setXVelocity] = useState(0);
  const [yGyro, setYGyro] = useState(0);
  const [yTilt, setYTilt] = useState(0);
  const [xGyro, setXGyro] = useState(0);
  const [xTilt, setXTilt] = useState(0);
  const [zGyro, setZGyro] = useState(0);
  const [zTilt, setZTilt] = useState(0);
  useEffect(() => {
    
    // console.log(count);
    const accelerometerSubscription = accelerometer.subscribe(({ x, y, z, timestamp }) => {
      setAccelerometerData({ x, y, z, timestamp });
      // if (accelerometerData.timestamp === 0) {
      //   setAccelerometerData({ x, y, z, timestamp });
      //   return;
      // }

      var accelerationX = x * Math.cos(xTilt);
      // Calculate distance based on acceleration (simplified calculation)
      var deltaT = 0.1; // 100 milliseconds in seconds
      // Integrate for velocity
      var newVelocityX =  0.5 + accelerationX * deltaT;
      var distanceX = newVelocityX * deltaT;
      setDistanceTraveled(distanceTraveled + distanceX);
    }
  );
  
    const gyroscopeSubscription = gyroscope.subscribe(({ x, y, z, timestamp }) => {
      setGyroscopeData({ x, y, z, timestamp });
      //Angles of tilt x, y, z axis
      var newYAngleVar = 0;
      var newXAngleVar = 0;
      var newZAngleVar = 0;

      newYAngleVar += yGyro*(GYROSCOPE_RATE/1000);
      newXAngleVar += xGyro*(GYROSCOPE_RATE/1000);
      newZAngleVar += zGyro*(GYROSCOPE_RATE/1000);

      setYGyro(0);
      setXGyro(0);
      setZGyro(0);

      newYAngleVar += y*(GYROSCOPE_RATE/1000);
      newXAngleVar += x*(GYROSCOPE_RATE/1000);
      newZAngleVar += z*(GYROSCOPE_RATE/1000);

      var yDegrees =  3 * newYAngleVar * (180/Math.PI);
      var xDegrees =  3 * newXAngleVar * (180/Math.PI);
      var zDegrees =  3 * newZAngleVar * (180/Math.PI);

      setYTilt(yTilt+yDegrees/2.48);
      setXTilt(xTilt+xDegrees/1.48);
      setZTilt(zTilt+zDegrees/2.48);

      if(props.data.length != 0){
        //Door tracking
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
            //console.log("Estimation: " + currentSegment);
            count++;
            if(count >= 60){
              if(count >= 100){
                if(props.distanceHistory.length < 1){
                  Tts.stop();
                  Tts.speak("Door lost, calculating position");
                  Tts.speak("Door last seen at " + currentSegment.toString() + "o'clock");
                }
                // Tts.stop();
                // Tts.speak("Door lost, calculating position");
                // Tts.speak("Door last seen at " + currentSegment.toString() + "o'clock");
              } else {
                if(props.distanceHistory.length < 1){
                  Tts.speak("Door last seen at " + currentSegment.toString() + "o'clock");
                }
              }
              count = 0;
            }
          } else {
            setAngleHistory(0);
            setGyroscopeHistory(gyroscopeHistory+y);
            //console.log(gyroscopeHistory);
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
  }, [gyroscopeData, accelerometerData, distanceTraveled]);

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

        <Text>Distance Traveled: {distanceTraveled.toFixed(2)} meters</Text>
        <Text>Door is at: {angleHistory.toFixed(2)} degrees</Text>
        <Text>Phone X Tilt {xTilt.toFixed(2)} degrees</Text>
        <Text>Phone Y Tilt {yTilt.toFixed(2)} degrees</Text>
        <Text>Phone Z Tilt {zTilt.toFixed(2)} degrees</Text>
    </View>
  );
};

export default SensorDisplay;