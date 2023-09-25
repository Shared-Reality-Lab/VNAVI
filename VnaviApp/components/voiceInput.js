import React from 'react';
import {View, Text, TouchableOpacity} from 'react-native';
import Voice from '@react-native-voice/voice';

const Voiceinput = () => {
  const [result, setResult] = React.useState('');
  const [error, setError] = React.useState('');
  const [isRecording, setIsRecording] = React.useState(false);


  Voice.onSpeechStart = ()=> setIsRecording(true);
  Voice.onSpeechEnd = ()=> setIsRecording(false);
  Voice.onSpeechError = (err)=> setError(err.message);
  Voice.onSpeechResults = result => setResult(result.value[0]);
   
  const startRecording = async ()=>{
    try{
        await Voice.start('en-US');
    } catch (err){
        setError(err.message);  
    }   
  };

  const stopRecording = async ()=>{
    try{
        await Voice.stop();
        setIsRecording(false);
    } catch (error){
        setError(error.message);
    }
  };

  return (
    <View style={{alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)' }}>
        <Text style={{fontSize:20, color: 'green', fontWeight: '500'}}>Voice Input:</Text>
        <Text>{result}</Text>
        <Text>{error}</Text>
        <TouchableOpacity 
          onPress={isRecording ? stopRecording : startRecording}> 
          <Text style={{color: 'red'}}>{isRecording ? 'Stop Recording' : 'Start Recording'}</Text>
        </TouchableOpacity> 
    </View>
  );
};

export default Voiceinput
