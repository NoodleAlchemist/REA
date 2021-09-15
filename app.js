var app$1 = require('firebase/app');
var firestore = require('firebase/firestore');
var auth$1 = require('firebase/auth');

// To run file bundle then run using the two following commands

// The device Firebase configuration
const firebaseConfig = {
  apiKey: "xxxxxxxxxxxxxxxxxxxxxxxxx",
  authDomain: "xxxxxxxxxxxxxxxxxxxxxxxm",
  projectId: "xxxxxxxxxxxxxxxxx",
  storageBucket: "xxxxxxxxxxxxxxxxxxxx",
  messagingSenderId: "xxxxxxxxxxxxxxxxx",
  appId: "xxxxxxxxxxxxxxx",
  measurementId: "xxxxxxxxxx"
};

// Initialize Firebase
const app = app$1.initializeApp(firebaseConfig);
const db = firestore.getFirestore(app);

const auth = auth$1.getAuth();

const fs = require('fs');
const accountInfo = require('./accountInfo.json');
let stateInfo = require('./stateInfo.json');
 // Uses this until it can get current info from the database

// PI 
// relays are active low so set them to high initially so the device starts out as off
const gpio = require('onoff').Gpio;
const humidifier = new gpio(20, 'high');
const heatLamp = new gpio(21, 'high');
const sensor = require('node-dht-sensor');

let user;
let currentTemperature;
let currentHumidity;

//Set device states to false on startup
let startUpFlag = true;

// global for manual functions
let updateDocument = false;

//console.log(`email: ${accountInfo.email} password: ${accountInfo.password}`);
// startUp();
setInterval(attemptLogin, (2 * 1000));
setInterval(readSensors, (5 * 1000));
setInterval(updateState, (5 * 1000));
setInterval(writeData, (5 * 60 * 1000));

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
  /*
  let max = 100;
  let min = 70;
  currentTemperature = Math.random() * (max - min) + min;
  currentHumidity = Math.random() * (max - min) + min;
  */

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
    updateDocument = true;
    console.log("Err! Humidity greater than upper bound!");
    stateInfo.humHiWarn = true;
  }else{
    updateDocument = true;
    stateInfo.humHiWarn = false;
  }

  if(stateInfo.manualOffHumidity){
    updateDocument = true;
    console.log(`Turning off humidifier manual override`);
    stateInfo.humidifierState = false;
    // Set humidifier pin to low
    humidifier.writeSync(1);
    return;
  }

  if(stateInfo.manualOnHumidity)
  {
    updateDocument = true;
    console.log(`Turning on humidifier manual override`);
    stateInfo.humidifierState = true;
    // Set humidifier pin to high
    humidifier.writeSync(0);
    return;
  }

  if(currentHumidity < stateInfo.humidityLowerBound)
  {
    updateDocument = true;
    console.log(`Turning on humidifier`);
    stateInfo.humidifierState = true;
    // Set humidifier pin to high
    humidifier.writeSync(0);
  }
  else if(stateInfo.humidifierState && currentHumidity > humidityMidPoint)
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
    updateDocument = true;
    console.log("Err! Temp greater than upper bound!");
    stateInfo.tempHiWarn = true;
  }else{
    updateDocument = true;
    stateInfo.tempHiWarn = false;
  }


  if(stateInfo.manualOffTemperature){
    updateDocument = true;
    console.log(`Turning off heater manual override`);
    stateInfo.heatingState = false;
    // Set heater pin to low
    heatLamp.writeSync(1);
    return;
  }

  if(stateInfo.manualOnTemperature){
    updateDocument = true;
    console.log(`Turning on heater manual override`);
    stateInfo.heatingState = true;
    // Set heater pin to high
    heatLamp.writeSync(0);
    return;
  }


  // Update heater state
  // if(currentTemperature < stateInfo.temperatureLowerBound && !stateInfo.heatingState)
  if(currentTemperature < stateInfo.temperatureLowerBound)
  {
    updateDocument = true;
    console.log(`Turning on heater`);
    stateInfo.heatingState = true;
    // Set heater pin to high
    heatLamp.writeSync(0);

  }
  else if(stateInfo.heatingState && currentTemperature > temperatureMidPoint)
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
  // updateDoc()
  if(updateDocument && user)
  {
    updateDoc();
  }


function updateDoc(){
  firestore.updateDoc(firestore.doc(db, `Devices/${user.uid}`), {
    heatingState: stateInfo.heatingState,
    humidifierState: stateInfo.humidifierState,
    tempHiWarn: stateInfo.tempHiWarn,
    humHiWarn: stateInfo.humHiWarn
  });
}

function attemptLogin()
{
  // If already logged in then just return
  if(user)
  {
    return;
  }

  auth$1.signInWithEmailAndPassword(auth, accountInfo.email, accountInfo.password)
  .then((userCredential) => {
    // Signed in 
    user = userCredential.user;

    // Start listening to the doc
    firestore.onSnapshot(firestore.doc(db, `Devices/${user.uid}`), (doc) => {

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
        updateDoc();
      }
      
      //console.log("Current data: ", doc.data());
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
