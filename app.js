// To run file bundle then run using the two following commands
// rollup app.js --file index.js --format cjs
// node index.js

// Import the functions you need from the SDKs you need
// https://firebase.google.com/docs/web/setup#available-libraries
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, addDoc, collection, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';

// The device Firebase configuration
// removed from public repo
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: ""
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const auth = getAuth();

const fs = require('fs');
const accountInfo = require('./accountInfo.json');
let stateInfo = require('./stateInfo.json');
 // Uses this until it can get current info from the database

// PI 
// relays are active low so set them to high initially so the device starts out as off
const gpio = require('onoff').Gpio;
const humidifier = new gpio(20, 'high');
const heatLamp = new gpio(21, 'high');
const sensor = require('node-dht-sensor')



let user;
let currentTemperature;
let currentHumidity;
//Set device states to false on startup
let startUpFlag = true;

// global for manual functions
let updateDocument = false;

let humHiWarn = false;
let tempHiWarn = false;

//console.log(`email: ${accountInfo.email} password: ${accountInfo.password}`);
// startUp();
setInterval(attemptLogin, (2 * 1000));
setInterval(readSensors, (5 * 1000));
setInterval(updateState, (5 * 1000));
setInterval(writeData, (7 *  1000));

// To run with a function parameter use a anon arrow function to call it
//setInterval(() => attemptLogin(stuff), 2000);

// TODO if we decide to add checking for if device is around then we also need to write to the other collection
function writeData()
{
  console.log("Current state: ", stateInfo);
  console.log(`Current sensor data: Temperature: ${currentTemperature} Humidity: ${currentHumidity}`);

  // Checks login state
  if(user)
  {
    console.log(`Writing current sensor data to database`);

    firestore.addDoc(firestore.collection(db, `Devices/${user.uid}/Readings`), {
      temperature: currentTemperature,
      humidity: currentHumidity,
      time: firestore.serverTimestamp()
    });
  }
  else
  {
    console.log("Not logged in");
  }
}

function readSensors()
{
  currentTemperature = parseFloat(sensor.read(11,13).temperature.toFixed(1), 10);
  currentHumidity = parseFloat(sensor.read(11,13).humidity.toFixed(1), 10);

}

// *****IMPORTANT***
// to use the manual overrides, frontend needs a button that sets overide state
// to true, and the other state to false when pressed.
// i.e. pressing heatlamp on button, sets stateInfo.manualOffTemperature to false  AND THEN stateInfo.manualOnTemperature to true 

function humidifierControl(){

  let humidityMidPoint = ((stateInfo.humidityUpperBound - stateInfo.humidityLowerBound) / 2) + stateInfo.humidityLowerBound;

  if(currentHumidity > stateInfo.humidityUpperBound){
    console.log("Err! Humidity greater than upper bound!");
    humHiWarn = true;
  }else{
    humHiWarn = false;
  }

  if(stateInfo.manualHumidity == 0){
    updateDocument = true;
    console.log(`Turning off humidifier manual override`);
    stateInfo.humidifierState = false;
    // Set humidifier pin to low
    humidifier.writeSync(1);
    return;
  }
  if(stateInfo.manualHumidity == 1)
  {
    updateDocument = true;
    console.log(`Turning on humidifier manual override`);
    stateInfo.humidifierState = true;
    // Set humidifier pin to high
    humidifier.writeSync(0);
    return;
  }


  if(currentHumidity <= stateInfo.humidityLowerBound)
  {
    updateDocument = true;
    console.log(`Turning on humidifier`);
    stateInfo.humidifierState = true;
    // Set humidifier pin to high
    humidifier.writeSync(0);
  }
  else if(stateInfo.humidifierState && currentHumidity >= humidityMidPoint)
  {
    updateDocument = true;
    console.log(`Turning off humidifier`);
    stateInfo.humidifierState = false;
    // Set humidifier pin to low
    humidifier.writeSync(1);
  }

}

function tempControl(){

  let temperatureMidPoint = ((stateInfo.temperatureUpperBound - stateInfo.temperatureLowerBound) / 2) + stateInfo.temperatureLowerBound;

  if(currentTemperature > stateInfo.temperatureUpperBound){
    console.log("Err! Temp greater than upper bound!");
    tempHiWarn = true;
  }else{ 
    tempHiWarn = false;
  }


  if(stateInfo.manualTemperature == 0){
    updateDocument = true;
    console.log(`Turning off heater manual override`);
    stateInfo.heatingState = false;
    // Set heater pin to low
    heatLamp.writeSync(1);
    return;
  }
 

  if(stateInfo.manualTemperature == 1){
    updateDocument = true;
    console.log(`Turning on heater manual override`);
    stateInfo.heatingState = true;
    // Set heater pin to high
    heatLamp.writeSync(0);
    return;
  }

  // Update heater state
  if(currentTemperature <= stateInfo.temperatureLowerBound)
  {
    updateDocument = true;
    console.log(`Turning on heater`);
    stateInfo.heatingState = true;
    // Set heater pin to high
    heatLamp.writeSync(0);

  }
  else if(stateInfo.heatingState && currentTemperature >= temperatureMidPoint)
  {
    updateDocument = true;
    console.log(`Turning off heater`);
    stateInfo.heatingState = false;
    // Set heater pin to low
    heatLamp.writeSync(1);
  }
}

// TODO: add checks for readings that are outside of bounds for too long
function updateState()
{
  // changed to global
  // let updateDocument = false;

  console.log(`Current Temperature: ${currentTemperature}`);
  console.log(`Current Humidity: ${currentHumidity}`);
  console.log(`Current heatingState: ${stateInfo.heatingState}`);
  console.log(`Current humidifierState: ${stateInfo.humidifierState}`);

  
  humidifierControl();
  tempControl();
  if(updateDocument && user)
  {
    updateDoc();
  }
  
}

function updateDoc(){
  firestore.updateDoc(firestore.doc(db, `Devices/${user.uid}`), {
    heatingState: stateInfo.heatingState,
    humidifierState: stateInfo.humidifierState,
  });
}
function attemptLogin()
{
  // If already logged in then just return
  if(user)
  {
    return;
  }

  signInWithEmailAndPassword(auth, accountInfo.email, accountInfo.password)
  .then((userCredential) => {
    // Signed in 
    
    user = userCredential.user;
    console.log(`${user.uid}`);

    // Start listening to the doc
    onSnapshot(doc(db, `Devices/${user.uid}`), (doc) => {

      console.log(doc.data());
      // Update stateInfo
      fs.writeFileSync('./stateInfo.json', JSON.stringify(doc.data()));

      // Updates
      stateInfo = doc.data();
      
      // If pi rebooted, set states to false, then let update state
      // config devices as needed
      if(startUpFlag){
        console.log(`last heatingState: ${stateInfo.heatingState}`);
        console.log(`last humidifierState: ${stateInfo.humidifierState}`);
        startUp();
        startUpFlag = false;
        console.log(`start heatingState: ${stateInfo.heatingState}`);
        console.log(`start humidifierState: ${stateInfo.humidifierState}`);
        readSensors();
        updateDocs();
      }
      //TODO update state
      updateState();
      //console.log("Current data: ", doc.data());
    },(error) =>{
      console.log(error.code);
      console.log(error.message);
    });
  })
  .catch((error) => {
    console.log(error.code);
    console.log(error.message);
  });

}

function startUp()
{
  stateInfo.heatingState = false;
  stateInfo.humidifierState = false;
}
