import React, {Component, useState} from 'react';
import {
  StyleSheet,
  View,
  Alert,
  TouchableOpacity,
  Text,
  Platform,
  Image,
  Modal,
  Button,
} from 'react-native';
import ImageEditor from '@react-native-community/image-editor';
import {RNCamera} from 'react-native-camera';
import RNFetchBlob from 'rn-fetch-blob';
import Tts from 'react-native-tts';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import Sound from 'react-native-sound';
import SensorDisplay from './components/sensorDisplay';
import Voiceinput from './components/voiceInput';
import {LogBox} from 'react-native';

LogBox.ignoreAllLogs();

var count = 3;
var door_found = false;
var searching_phase = true;

const options = {
  enableVibrateFallback: true,
  ignoreAndroidSystemSettings: false,
};

const androidParams = {
  KEY_PARAM_PAN: -1,
  KEY_PARAM_VOLUME: 0.5,
  KEY_PARAM_STREAM: 'STREAM_MUSIC',
};

const iosParams = {
  iosVoiceId: 'com.apple.ttsbundle.Moira',
};

const MAX_UNKNOWN_READINGS = 5; // change depending on number of readings per time unit

const sounds = [
  'beep_1_center.mp3',
  'beep_2_center.mp3',
  'beep_3_center.mp3',
  'beep_4_center.mp3',
];

const map_sounds = {
  beep_1_center: 'beep_1_center.mp3',
  beep_2_center: 'beep_2_center.mp3',
  beep_3_center: 'beep_3_center.mp3',
  beep_4_center: 'beep_4_center.mp3',
};

const instructions =
  'Welcome to the Vision-guided Navigation Assistance for the Visually Impaired Application. ' +
  'This application will help you traverse through doorways by performing camera captured image analysis and giving audio navigation. ' +
  'To begin, choose the mode of feedback you would like to receive using the TOGGLE MODE button below. ' +
  'Two modes are proposed: Voice mode and Beep mode. In voice mode, my voice will indicate the locations ' +
  'of doors and how close you are to them. In beep mode, spatialized beeps will be heard around you once doors are detected. ' +
  'These beeps will get increasingly faster as you approach the door (from 1 to 4 beeps). You will hear a voice indication when you have reached the door! ' +
  'The beeps are also spatialized relatively to the direction of the door, so a door slightly to the left will produce a beep panned ' +
  'to the left. Press the TAKE STREAM AND PRODUCE OUTPUT button below to start the stream and hit the STOP STREAM to stop. Happy navigation!';

distanceHistory = [];
var reachForHandle = false;

class App extends Component {
  // Change this url to the server's IP:PORT, 10.0.2.2 is for AVD localhost testing purpose.
  //url = 'http://132.206.74.92:8002/';
  url = 'https://martian.cim.mcgill.ca/vnavi/';
  my_path = '';
  resized_img_path = '';
  // Image resize
  h = 1280;
  w = 640;

  state = {
    saved_state_data: [],
    takingPic: false,
    isVisible: false,
    running: false,
    mode: 'Voice',
    speaking: false,
    phase: 'Searching',
    handleSpoken: false,
    doorExpectation: 'undefined',
    doorReadings: {
      dists: [],
      angles: [],
      names: [],
      centerXCoord: [],
    },
    multiDoorReadings: {
      dists: [],
      angles: [],
    },
    totalSpoken: 0,
    lastSpokenWords: '',
    numberOfSame: 0,
    sounds: {},
    unknownReadings: 0,
    last_two_data: [],
    result: '',
  };

  handleResult = result => {
    //console.log(result);
    this.setState({result});
  };

  setupSounds() {
    for (let i = 0; i < sounds.length; i++) {
      let sound = new Sound(sounds[i], Sound.MAIN_BUNDLE, error => {
        if (error) {
          console.log('failed to load the sound', error);
          return;
        }
        console.log('sound ' + sounds[i] + ' loaded successfully');
      });
      // Reduce the volume by half
      sound.setVolume(0.5);

      this.setState(prevState => ({
        sounds: {
          ...prevState.sounds,
          [sounds[i]]: sound,
        },
      }));
    }
  }

  componentDidMount = () => {
    Tts.setDefaultLanguage('en-US');
    console.log('get init status');
    Tts.getInitStatus().then(() => {
      Tts.setDefaultRate(0.75);
      Tts.speak('Hello World!');
      console.log('said hello world');
    });
  };

  resetState = () => {
    this.setState({
      takingPic: false,
      isVisible: false,
      phase: 'Searching',
      doorReadings: {
        dists: [],
        angles: [],
      },
      totalSpoken: 0,
      lastSpokenWords: '',
      numberOfSame: 0,
      unknownReadings: 0,
    });
  };

  takePicture_img = async () => {
    if (this.camera && !this.state.takingPic) {
      let options = {
        quality: 0.85,
        fixOrientation: true,
        forceUpOrientation: true,
      };

      this.setState({takingPic: true});

      try {
        const data = await this.camera.takePictureAsync(options);
        // To print alerts, Alert.alert('Successful', JSON.stringify(data));

        // Resizing image to reduce transmission time
        const cropData = {
          offset: {x: 0, y: 0},
          size: {width: data.width, height: data.height},
          displaySize: {width: this.w, height: this.h},
        };
        await ImageEditor.cropImage(data.uri, cropData).then(url => {
          this.resized_img_path = url;
        });

        RNFetchBlob.config({
          fileCache: true,
          appendExt: 'jpg',
        })
          .fetch(
            'POST',
            this.url + 'detect-res-img',
            {'Content-Type': 'multipart/form-data'},
            [
              {
                name: 'file',
                filename: 'photo.jpg',
                type: 'image/jpeg',
                // data: RNFetchBlob.wrap(data.uri),
                data: RNFetchBlob.wrap(this.resized_img_path),
              },
            ],
          )
          // Optional:
          // .then(res => checkStatus(res))
          // .then(res => res.json())

          .then(res => {
            console.log('The file saved to ', res.path());
            this.my_path = res.path();
            this.setState({isVisible: true});
          })
          .catch(e => console.log(e))
          .done();
      } catch (err) {
        Alert.alert('Error', 'Failed to take picture: ' + (err.message || err));
      } finally {
        this.setState({takingPic: false});
      }
    }
  };

  takePicture = async () => {
    if (this.camera && !this.state.takingPic) {
      let options = {
        quality: 0.85,
        fixOrientation: true,
        forceUpOrientation: true,
      };

      this.setState({takingPic: true});

      try {
        const data = await this.camera.takePictureAsync(options);
        // To print alert, Alert.alert('Successful', JSON.stringify(data));

        // Resizing image to reduce transmission time
        const cropData = {
          offset: {x: 0, y: 0},
          size: {width: data.width, height: data.height},
          displaySize: {width: this.w, height: this.h},
        };
        await ImageEditor.cropImage(data.uri, cropData).then(url => {
          this.resized_img_path = url;
        });

        let body = new FormData();
        body.append('file', {
          uri: this.resized_img_path,
          name: 'photo.jpg',
          type: 'image/jpeg',
        });

        fetch(this.url + 'detect-res-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          body: body,
        })
          // .then(res => checkStatus(res))
          .then(res => res.json())
          .then(res => {
            //console.log('response' + JSON.stringify(res));
            Alert.alert('Results:', JSON.stringify(res));
          })
          .catch(e => console.log(e))
          .done();
      } catch (err) {
        Alert.alert('Error', 'Failed to take picture: ' + (err.message || err));
      } finally {
        this.setState({takingPic: false});
      }
    }
  };

  delay = time => new Promise(resolve => setTimeout(resolve, time));

  takeStream = async () => {
    // Modified above to take multiple images and pass them to AudioFeedback
    const last_two_data = [];
    bad_read = false;
    if (this.state.running) {
      return;
    }
    this.state.running = true;
    while (this.state.running) {
      //console.log('in loop');
      if (this.camera && !this.state.takingPic) {
        let options = {
          quality: 0.85,
          fixOrientation: true,
          forceUpOrientation: true,
        };

        this.setState({takingPic: true});

        try {
          const data = await this.camera.takePictureAsync(options);
          // To print alert, Alert.alert('Successful', JSON.stringify(data));

          // Resizing image to reduce transmission time
          const cropData = {
            offset: {x: 0, y: 0},
            size: {width: data.width, height: data.height},
            displaySize: {width: this.w, height: this.h},
          };
          await ImageEditor.cropImage(data.uri, cropData).then(url => {
            this.resized_img_path = url;
          });

          let body = new FormData();
          body.append('file', {
            uri: this.resized_img_path,
            name: 'photo.jpg',
            type: 'image/jpeg',
          });

          fetch(this.url + 'detect-res-json', {
            method: 'POST',
            headers: {
              'Content-Type': 'multipart/form-data',
            },
            body: body,
          })
            // .then(res => checkStatus(res))
            .then(res => {
              return res.json();
            })
            .then(res => {
              if (
                res.data &&
                res.data[0] &&
                res.data[0][1] &&
                res.data[0][1] > 30
              ) {
                bad_read = true;
              }
              //console.log('response' + JSON.stringify(res));
              if (!bad_read) {
                if (last_two_data[0] == null) {
                  if (res.data[0] == undefined) {
                    last_two_data[0] = 'no door';
                  } else {
                    last_two_data[0] = res.data[0][0];
                    last_two_data[2] = res.data[0][0];
                  }
                } else if (last_two_data[1] == null) {
                  if (res.data[0] == undefined) {
                    last_two_data[1] = 'no door';
                  } else {
                    last_two_data[1] = res.data[0][0];
                    last_two_data[2] = res.data[0][0];
                  }
                } else {
                  last_two_data[0] = last_two_data[1];
                  if (res.data[0] == undefined) {
                    last_two_data[1] = 'no door';
                  } else {
                    last_two_data[1] = res.data[0][0];
                    last_two_data[2] = res.data[0][0];
                  }
                }
              }
              if (!bad_read) {
                this.outputResult(res, last_two_data);
              }
            })
            .catch(e => console.log(e))
            .done();
        } catch (err) {
          Alert.alert(
            'Error',
            'Failed to take picture: ' + (err.message || err),
          );
        } finally {
          if (!bad_read) {
            this.setState({takingPic: false});
          }
        }
      }
      if (!bad_read) {
        this.setState({last_two_data: last_two_data});
      }
      await this.delay(0);
    }
  };

  outputPositionText = position => {
    console.log(position);
    switch (position) {
      case 10:
      case 11:
      case 1:
      case 2:
        return 'At ' + position + " o'clock";
      case 12:
        return 'Straight ahead';
      default:
        return '';
    }
  };
  isDecreasingTrend(points) {
    console.log(points);

    if (points.length < 2) {
      return false;
    }
    let totalX = 0;
    let totalY = 0;
    let xySum = 0;
    let xSquaredSum = 0;

    for (let i = 0; i < points.length; i++) {
      totalX += i;
      totalY += points[i];
      xySum += i * points[i];
      xSquaredSum += i * i;
    }

    const slope =
      (points.length * xySum - totalX * totalY) /
      (points.length * xSquaredSum - totalX * totalX);

    return slope < 0;
  }

  speakInstructions = words => {
    Tts.setDefaultRate(0.5);
    if (!this.state.speaking) {
      this.setState({speaking: true});
      if (Platform.OS === 'android') {
        Tts.speak(words, {androidParams: androidParams});
      } else {
        Tts.speak(words, iosParams);
      }
    }
    Tts.setDefaultRate(0.6);
  };

  speak = words => {
    if (this.state.lastSpokenWords == words && this.state.numberOfSame < 3) {
      this.setState({numberOfSame: this.state.numberOfSame + 1});
      return;
    }
    if (this.state.numberOfSame >= 3) {
      this.setState({numberOfSame: 0});
    }
    if (this.state.totalSpoken == 10) {
      Tts.stop();
      this.setState({totalSpoken: 0});
    }
    // only speak if not already speaking
    if (
      !this.state.speaking ||
      words.includes('reached') ||
      words.includes('Calibration')
    ) {
      this.setState({
        speaking: true,
        totalSpoken: this.state.totalSpoken + 1,
        lastSpokenWords: words,
      });
      if (Platform.OS === 'android') {
        Tts.speak(words, {androidParams: androidParams});
      } else {
        Tts.speak(words, iosParams);
      }
    }
  };

  playSound = sound => {
    // Get the current playback point in seconds
    sound.getCurrentTime(seconds => console.log('playing at ' + seconds));

    // Pause the sound
    sound.pause();

    // Stop the sound and rewind to the beginning
    sound.stop(() => {
      // Note: If you want to play a sound after stopping and rewinding it,
      // it is important to call play() in a callback.
      sound.play(success => {
        if (success) {
          console.log('successfully finished playing');
          sound.stop();
        } else {
          console.log('playback failed due to audio decoding errors');
          sound.stop();
        }
      });
    });

    // Release the audio player resource
    // sound.release();
  };

  vibrateIntensityBasedOnDistance = distance => {
    // possible looping as distance gets smaller
    if (distance < 1) {
      ReactNativeHapticFeedback.trigger('impactHeavy', options);
      console.log('vibrate heavy');
    } else if (distance < 2) {
      ReactNativeHapticFeedback.trigger('impactMedium', options);
      console.log('vibrate medium');
    } else {
      ReactNativeHapticFeedback.trigger('impactLight', options);
      console.log('vibrate light');
    }
  };

  beepBasedOnDistanceAndAngle = (distance, angle) => {
    let beep;
    if (distance < 0.5) {
      beep = this.state.sounds[map_sounds['beep_4_center']];
    } else if (distance < 1.6) {
      beep = this.state.sounds[map_sounds['beep_3_center']];
    } else if (distance < 3) {
      beep = this.state.sounds[map_sounds['beep_2_center']];
    } else {
      beep = this.state.sounds[map_sounds['beep_1_center']];
    }
    if (angle == 10) {
      beep.setPan(-1);
      this.playSound(beep);
    } else if (angle == 11) {
      beep.setPan(-0.5);
      this.playSound(beep);
    } else if (angle == 12) {
      beep.setPan(0);
      this.playSound(beep);
    } else if (angle == 1) {
      beep.setPan(0.5);
      this.playSound(beep);
    } else if (angle == 2) {
      beep.setPan(1);
      this.playSound(beep);
    }
  };

  calculateStdev(array) {
    if (array.length == 0) {
      return 0;
    }
    const n = array.length;
    const mean = array.reduce((a, b) => a + b) / n;
    return Math.sqrt(
      array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n,
    );
  }

  relativeDiff = (num1, num2) => {
    if (num1 == 0 && num2 == 0) {
      return 0;
    }
    if (num1 == 0) {
      return Math.abs(num1 - num2) / num2;
    } else if (num2 == 0) {
      return Math.abs(num1 - num2) / num1;
    } else {
      return 0;
    }
  };

  searchPhase = (distances, angles, names) => {
    console.log('searching phase');
    if (names.length >= 4) {
      let multiDoorDistances = [];
      let multiDoorAngles = [];
      for (let i = 0; i < names.length - 1; i++) {
        //Check for door and handle pairs
        if (
          (names[i] === 'door' && names[i + 1] === 'handle') ||
          (names[i] === 'handle' && names[i + 1] === 'door')
        ) {
          console.log('Door and Handle Pair Found');
          if (
            angles[i] === angles[i + 1] ||
            angles[i] + 1 === angles[i + 1] ||
            angles[i] === angles[i] + 1
          ) {
            console.log('Door and Handle Pair Found');
            if (names[i] === 'door') {
              multiDoorDistances.push(distances[i]);
              multiDoorAngles.push(angles[i]);
            } else {
              multiDoorDistances.push(distances[i + 1]);
              multiDoorAngles.push(angles[i + 1]);
            }
          }
        }
      }
      console.log(multiDoorDistances);
      //We have more than one door in front of us
      if (multiDoorDistances.length >= 2) {
        this.state.multiDoorReadings.dists = multiDoorDistances;
        this.state.multiDoorReadings.angles = multiDoorAngles;
        this.setState({multiDoorReadings: this.state.multiDoorReadings});
        this.setState({phase: 'Door Selection'});
        return;
      }
    }

    console.log('Door Detected');
    count++;
    //distances[0] = Math.round(distances[0] * 10) / 10;
    console.log(distances[0] + ' meters away');
    this.state.doorReadings.dists.push(distances[0]);
    this.state.doorReadings.angles.push(angles[0]);
    let dist_prev =
      this.state.doorReadings.dists[this.state.doorReadings.dists.length - 2];
    let ang_prev =
      this.state.doorReadings.angles[this.state.doorReadings.angles.length - 2];
    this.setState({doorReadings: this.state.doorReadings});
    if (distances[0] > dist_prev) {
      console.log('Door is getting further away');
      return;
    }
    if (this.state.doorReadings.dists.length <= 1) {
      if (this.state.mode == 'Voice') {
        if (count > 3 || !door_found) {
          count = 0;
          door_found = true;
          searching_phase = false;
          Tts.stop();
          Tts.speak(
            'A door was detected, ' +
              distances[0] +
              ' meters away, ' +
              this.outputPositionText(angles[0]),
          );
        }
        // maybe filter out very high distances (e.g > 10 meters)
      } else {
        this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
      }
    } else {
      console.log(this.relativeDiff(distances[0], dist_prev));
      if (
        this.relativeDiff(distances[0], dist_prev) < 0.5 &&
        Math.abs(angles[0] - ang_prev) <= 2
      ) {
        if (distances[0] > 2) {
          ``;
          // we are more than 2 meters away
          if (this.state.mode == 'Voice') {
            if (count > 3 || !door_found) {
              count = 0;
              door_found = true;
              searching_phase = false;
              Tts.stop();
              Tts.speak(
                'A door was detected, ' +
                  distances[0] +
                  ' meters away, ' +
                  this.outputPositionText(angles[0]),
              );
            }
            // maybe filter out very high distances (e.g > 10 meters)
          } else {
            this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
          }
          this.setState({phase: 'Calibrating'});
        } else if (distances[0] > 0.5 && distances[0] < 2) {
          // we are between 0.5 and 2 meters away
          if (this.state.mode == 'Voice') {
            if (count > 3 || !door_found) {
              count = 0;
              door_found = true;
              searching_phase = false;
              Tts.stop();
              Tts.speak(
                'A door was detected, ' +
                  distances[0] +
                  ' meters away, ' +
                  this.outputPositionText(angles[0]),
              );
            }
          } else {
            this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
          }
          this.setState({phase: 'Approaching'});
        } else if (distances[0] > 0) {
          // we are less than 0.5 meters away
          if (this.state.mode == 'Voice') {
            if (count > 3 || !door_found) {
              count = 0;
              door_found = true;
              searching_phase = false;
              Tts.stop();
              Tts.speak(
                'A door was detected, ' +
                  distances[0] +
                  ' meters away, ' +
                  this.outputPositionText(angles[0]),
              );
            }
          } else {
            this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
          }
          this.setState({phase: 'Approaching'});
        } else {
          // we are 0 meters away
          // maybe wait for a second reading to confirm
          console.log('door reached already');
          Tts.speak('Door reached already');
          this.resetState();
        }
      } else {
        if (this.state.mode == 'Beep') {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      }
    }
  };

  doorSelectionPhase = (multiDoorDistances, multiDoorAngles) => {
    Tts.speak('Hey there are multiple doors in front of you.');

    for (let i = 1; i <= multiDoorDistances.length; i++) {
      //TTS can't pronounce is correctly so we switched to to es
      Tts.speak(
        'Door ' + i + 'es' + this.outputPositionText(multiDoorAngles[i - 1]),
      );
    }
    Tts.speak(
      'Please select between the doors by saying the door number. Example: Door 1.',
    );
    //Programmatically press the button to start the voice input

    //Wait for user input
    const doorNumber = result.match(/\d+/);
    if (doorNumber <= multiDoorDistances.length && doorNumber > 0) {
    } else {
    }
  };
  //Operations
  //Return 1 door has to correspond with input of Calibration Phase

  calibratingPhase = (distances, angles) => {
    console.log('Calibrating phase');
    //distances[0] = Math.round(distances[0] * 10) / 10;
    console.log(distances[0] + ' meters away');
    this.state.doorReadings.dists.push(distances[0]);
    this.state.doorReadings.angles.push(angles[0]);
    let dist_prev =
      this.state.doorReadings.dists[this.state.doorReadings.dists.length - 2];
    let ang_prev =
      this.state.doorReadings.angles[this.state.doorReadings.angles.length - 2];
    this.setState({doorReadings: this.state.doorReadings});
    if (distances[0] > dist_prev) {
      console.log('Door is getting further away');
      return;
    }
    if (distances[0] > 2.5) {
      // we are greater than 2.5 meters away
      if (this.state.mode == 'Voice') {
        this.speak(
          'Only ' +
            distances[0] +
            ' meters away, ' +
            this.outputPositionText(angles[0]),
        );
      } else {
        this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
      }
    } else if (distances[0] > 0.5 && distances[0] < 3) {
      // we are between 0.5 and 2 meters away
      console.log(this.relativeDiff(distances[0], dist_prev));
      if (
        this.relativeDiff(distances[0], dist_prev) < 0.5 &&
        Math.abs(angles[0] - ang_prev) <= 2
      ) {
        this.setState({phase: 'Approaching'});
        if (this.state.mode == 'Voice') {
          this.speak(
            'Entering approaching phase, you are now ' +
              distances[0] +
              ' meters away. Door is ' +
              this.outputPositionText(angles[0]),
          );
        } else {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      } else {
        if (this.state.mode == 'Beep') {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      }
    } else if (distances[0] > 0) {
      // we are less than 0.5 meters away
      console.log(this.relativeDiff(distances[0], dist_prev));
      if (
        this.relativeDiff(distances[0], dist_prev) < 0.5 &&
        Math.abs(angles[0] - ang_prev) <= 2
      ) {
        this.setState({phase: 'Approaching'});
        if (this.state.mode == 'Voice') {
          this.speak(
            'Reach for the door, it is only ' +
              distances[0] +
              ' meters away, ' +
              this.outputPositionText(angles[0]),
          );
        } else {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      } else {
        if (this.state.mode == 'Beep') {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      }
    } else {
      // we are 0 meters away
      console.log(this.relativeDiff(distances[0], dist_prev));
      if (
        this.relativeDiff(distances[0], dist_prev) < 0.5 &&
        Math.abs(angles[0] - ang_prev) <= 2
      ) {
        console.log('door reached already');
        this.speak('Door reached!');
        this.resetState();
      } else {
        if (this.state.mode == 'Beep') {
          this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
        }
      }
    }
  };

  approachingPhase = (distances, angles, names, centerXCoords) => {
    //Indicate to the user if the door handle is on the right or left
    if (names.length === 2 && !this.state.handleSpoken) {
      this.setState({handleSpoken: true});
      if (centerXCoords[0] >= centerXCoords[1]) {
        if (names[0] === 'door') {
          Tts.speak('Door handle is on the left.');
        } else {
          Tts.speak('Door handle is on the right.');
        }
      } else if (names[0] === 'door') {
        Tts.speak('Door handle is on the right.');
      } else {
        Tts.speak('Door handle is on the left.');
      }
    }
    // console.log('New detection');
    //distances[0] = Math.round(distances[0] * 10) / 10;
    console.log('approaching phase');
    if (distances[0] < 3) {
      distanceHistory.push(distances[0]);
    }
    //console.log(distanceHistory);
    console.log(distances[0] + ' meters away');
    this.state.doorReadings.dists.push(distances[0]);
    this.state.doorReadings.angles.push(angles[0]);
    let dist_prev =
      this.state.doorReadings.dists[this.state.doorReadings.dists.length - 2];
    let ang_prev =
      this.state.doorReadings.angles[this.state.doorReadings.angles.length - 2];
    this.setState({doorReadings: this.state.doorReadings});
    // if (distances[0] > dist_prev) {
    //   console.log('Door is getting further away');
    //   return;
    // }
    // if (distances[0] > 2) {
    //   // we are greater than 2 meters away, which is impossible in the approaching phase
    //   console.log('Invalid reading');
    // }
    // if (distances[0] > 0.5 && distances[0] < 2) {
    // we are between 0.5 and 2 meters away
    if (this.state.mode == 'Voice') {
      //Tts.stop();
      // Tts.speak(
      //   'Only ' +
      //     distances[0] +
      //     ' meters away, Try to reach for the door, ' +
      //     this.outputPositionText(angles[0]),
      //);
    } else {
      this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
    }
    //}
    // if (distances[0] < 0.5) {
    //   // we are less than 0.5 meters away
    //   console.log('reach for doorknob');
    //   if (this.state.mode == 'Voice') {
    //     this.speak(
    //       'Reach for the door, it is only ' +
    //         distances[0] +
    //         ' meters away, ' +
    //         this.outputPositionText(angles[0]),
    //     );
    //   } else {
    //     this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
    //   }
    // } else {
    //   // we are 0 meters away
    //   console.log(this.relativeDiff(distances[0], dist_prev));
    //   if (
    //     this.relativeDiff(distances[0], dist_prev) < 0.5 &&
    //     Math.abs(angles[0] - ang_prev) <= 2
    //   ) {
    //     console.log('door reached already');
    //     this.speak('Door reached!');
    //     this.resetState();
    //   } else {
    //     if (this.state.mode == 'Beep') {
    //       this.beepBasedOnDistanceAndAngle(distances[0], angles[0]);
    //     }
    //   }
    // }
  };

  outputResult = (res, last_two_data) => {
    //{"columns":["orie(clk)","dist(m)","conf"],"index":[0],"data":[[12,0,0.425]]}
    let distances = [];
    let angles = [];
    let names = [];
    let centerXCoords = [];

    for (let i = 0; i < res.index.length; i++) {
      // only save result if name is door
      if (res.data[res.index[i]][3] === 'door') {
        let index = res.index[i];
        let data = res.data[index];
        let angle = data[0];
        let distance = data[1];
        let confidence = data[2];
        let name = data[3];
        let centerXCoord = data[4];
        distances.push(distance);
        angles.push(angle);
        names.push(name);
        centerXCoords.push(centerXCoord);
      }
    }

    if (distances.length == 0) {
      //As long as we have no results we won't be entering the search phase
      if (distanceHistory.length > 5) {
        str = '';
        if (this.isDecreasingTrend(distanceHistory)) {
          if (!reachForHandle) {
            str = 'Reach out for the handle.';
            this.setState({doorExpectation: 'arrived'});
          }
          reachForHandle = true;
        } else {
          str = 'Door lost.';
          this.setState({doorExpectation: 'lost'});
        }
        //Tts.stop()
        //Tts.speak(str)
        distanceHistory = [];
      }
      door_found = false;
      count++;
      if (count > 3 && searching_phase) {
        count = 0;
        Tts.stop();
        Tts.speak('No door found, keep looking around');
      }
      if (this.state.unknownReadings >= MAX_UNKNOWN_READINGS) {
        this.resetState(last_two_data);
      } else {
        this.setState({unknownReadings: this.state.unknownReadings + 1});
        if (
          last_two_data[0] !== 'no door' &&
          last_two_data[1] === 'no door' &&
          this.state.unknownReadings === 1
        ) {
          this.state.saved_state_data = last_two_data;
          this.setState({saved_state_data: this.state.saved_state_data});
          console.log('entered');
        }

        // console.log('SAVED DATA: ' + this.state.saved_state_data);
      }
      return;
    } else {
      this.setState({unknownReadings: 0});
    }
    if (this.state.phase == 'Searching') {
      this.searchPhase(distances, angles, names);
    } else if (this.state.phase == 'Door Selection') {
      this.doorSelectionPhase(
        this.state.multiDoorReadings.dists,
        this.state.multiDoorReadings.angles,
      );
    } else if (this.state.phase == 'Calibrating') {
      this.calibratingPhase(distances, angles);
    } else {
      this.approachingPhase(distances, angles, names, centerXCoords);
    }
  };

  stopStream = () => {
    this.setState({running: false});
    Tts.stop();
    this.resetState();
  };

  render() {
    const {result} = this.state;
    return (
      <View style={styles.container}>
        <RNCamera
          captureAudio={false}
          style={{flex: 5, alignItems: 'center'}}
          ref={ref => {
            this.camera = ref;
          }}>
          <TouchableOpacity
            activeOpacity={0.5}
            style={styles.buttonHelp}
            onPress={() => this.speakInstructions(instructions)}>
            <Text
              style={{
                alignItems: 'center',
                color: '#ffffff',
                fontWeight: 'bold',
              }}>
              HELP
            </Text>
          </TouchableOpacity>
        </RNCamera>
        <View>
          <Text>{result}</Text>
          <Voiceinput onResult={this.handleResult} />
        </View>
        <SensorDisplay
          data={this.state.last_two_data}
          distanceHistory={distanceHistory}
          doorExpectation={this.state.doorExpectation}
        />
        <Text style={styles.text}>
          {(this.state.running ? this.state.phase + ' phase' : 'Not Running') +
            ':' +
            this.state.mode +
            ' mode'}
        </Text>
        <TouchableOpacity
          activeOpacity={0.5}
          style={styles.button}
          onPress={this.takePicture}>
          <Text
            style={{
              alignItems: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
            }}>
            ANALYSIS ONCE (JSON)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.5}
          style={styles.button}
          onPress={this.takePicture_img}>
          <Text
            style={{
              alignItems: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
            }}>
            TAKE PICTURE (img)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.5}
          style={styles.button}
          onPress={() => {
            this.state.running ? this.stopStream() : this.takeStream();
          }}>
          <Text
            style={{
              alignItems: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
            }}>
            {this.state.running ? 'STOP STREAM' : 'TAKE STREAM'}
          </Text>
        </TouchableOpacity>
        <Button
          title={this.state.mode + ' mode'}
          onPress={() => {
            this.setState({
              mode: this.state.mode == 'Voice' ? 'Beep' : 'Voice',
            });
          }}
        />
        <Text>{this.state.mode}</Text>
        <Modal
          animationType={'fade'}
          transparent={false}
          visible={this.state.isVisible}
          onRequestClose={() => {
            console.log('Modal has been closed.');
          }}>
          {/*Modal*/}
          <View style={styles.modal}>
            <Image
              style={styles.image}
              source={{
                uri:
                  Platform.OS === 'android'
                    ? 'file://' + this.my_path
                    : '' + this.my_path,
              }}
            />
            <Button
              title="Back"
              onPress={() => {
                this.setState({isVisible: !this.state.isVisible});
              }}
            />
          </View>
        </Modal>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 7,
    flexDirection: 'column',
    backgroundColor: 'black',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#008ecc',
    padding: 10,
    marginBottom: 10,
  },
  buttonHelp: {
    alignItems: 'center',
    backgroundColor: '#008ecc',
    padding: 5,
  },
  text: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
    padding: 5,
    backgroundColor: 'black',
  },
  modal: {
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fff',
  },
  image: {
    width: '100%',
    height: '95%',
  },
});

export default App;
