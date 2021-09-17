const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const { firebaseConfig } = require("firebase-functions");

admin.initializeApp();
const db = admin.firestore();

const app = express();

// Simple example that returns the current time
app.get(`/currentTime`, (req, res) => {
    res.send(`The current time is ${(new Date(Date.now())).toDateString()}`);
});

exports.app = functions.https.onRequest(app);

exports.setupUserData = functions.auth.user().onCreate(async (user) => {
    
    // Test if user email has the @reasd.com domain
    if(user.email.endsWith(`@reasd.com`))
    {
        // Fields need to be cleaned up
        const data = {
            auto: true,
            heatingState: true,
            humHiWarn: false,
            humidifierState: true,
            humidityLowerBound: 20,
            humidityUpperBound: 39,
            manualOffHumidity: false,
            manualOnHumidity: true,
            manualOnTemperature: false,
            tempHiWarn: false,
            temperatureLowerBound: 15,
            temperatureUpperBound: 27
        }

        db.collection('Devices').doc(user.uid).set(data);

    }
    else
    {
        // Creates an empty array
        const data = {
            devices: []
        }

        db.collection('Users').doc(user.uid).set(data);
    }
});
