/**
 * Copyright 2015 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

require( 'dotenv' ).config( {silent: true} );

var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var fs = require('fs');


var express = require( 'express' );  // app server
var bodyParser = require( 'body-parser' );  // parser for post requests
var watson = require( 'watson-developer-cloud' );  // watson sdk
var http = require('http');

// The following requires are needed for logging purposes
var uuid = require( 'uuid' );
var vcapServices = require( 'vcap_services' );
var basicAuth = require( 'basic-auth-connect' );
// var person_flag = 0;


var total_number_injured = null;
var current_patient = null;
var initialized = 0;
var patient_data_array = null;
var datapoints = 11;
var additional_information = null;
var emergency_type = null;
var open = require('open');


// The app owner may optionally configure a cloudand db to track user input.
// This cloudand db is not required, the app will operate without it.
// If logging is enabled the app must also enable basic auth to secure logging
// endpoints
var cloudantCredentials = vcapServices.getCredentials( 'cloudantNoSQLDB' );
var cloudantUrl = null;
if ( cloudantCredentials ) {
  cloudantUrl = cloudantCredentials.url;
}
cloudantUrl = cloudantUrl || process.env.CLOUDANT_URL; // || '<cloudant_url>';
var logs = null;
var app = express();

// Bootstrap application settings
app.use( express.static( './public' ) ); // load UI from public folder
app.use( bodyParser.json() );

// Create the service wrapper
var conversation = watson.conversation( {
  url: 'https://gateway.watsonplatform.net/conversation/api',
  username: process.env.CONVERSATION_USERNAME || '<username>',
  password: process.env.CONVERSATION_PASSWORD || '<password>',
  version_date: '2016-07-11',
  version: 'v1'
} );

var speech_to_text = watson.speech_to_text({
  username: process.env.SPEECH_TO_TEXT_USERNAME || '<username>',
  password: process.env.SPEECH_TO_TEXT_PASSWORD || '<password>',
  version: 'v1'
});

// Endpoint to be call from the client side
app.post( '/api/message', function(req, res) {
  var workspace = process.env.WORKSPACE_ID || '<workspace-id>';
  if ( !workspace || workspace === '<workspace-id>' ) {
    return res.json( {
      'output': {
        'text': 'The app has not been configured with a <b>WORKSPACE_ID</b> environment variable. Please refer to the ' +
        '<a href="https://github.com/watson-developer-cloud/conversation-simple">README</a> documentation on how to set this variable. <br>' +
        'Once a workspace has been defined the intents may be imported from ' +
        '<a href="https://github.com/watson-developer-cloud/conversation-simple/blob/master/training/car_workspace.json">here</a> in order to get a working application.'
      }
    } );
  }
  var payload = {
    workspace_id: workspace,
    context: {},
    input: {}
  };
  if ( req.body ) {
    if ( req.body.input ) {
      // the commented out line below is where we will feed the text from the speech to text service into the conversation agent.
      // payload.input = { text : 'yes'};
      // console.log(req.body.input);
      payload.input = req.body.input;
    }
    if ( req.body.context ) {
      // The client must maintain context/state
      payload.context = req.body.context;
      // console.log("IN HERE");
    }
  }
  // Send the input to the conversation service
  conversation.message( payload, function(err, data) {
    if ( err ) {
      return res.status( err.code || 500 ).json( err );
    }
    updateMessage(res, payload, data);
  } );
} );

/**
 * Updates the response text using the intent confidence
 * @param  {Object} input The request to the Conversation service
 * @param  {Object} response The response from the Conversation service
 * @return {Object}          The response with the updated message
 */
function updateMessage(res, input, data) {
  
  speech_to_text.getModels(null, function(error, models) {
  if (error)
    console.log('error:', error);
  else
    console.log(JSON.stringify(models, null, 2));
});

  var params = {
  model_id: 'en-US_BroadbandModel'
};

speech_to_text.getModel(params, function(error, model) {
  if (error)
    console.log('error:', error);
  else
    console.log(JSON.stringify(model, null, 2));
});


var params = {
  content_type: 'audio/wav',
  continuous: true,
  interim_results: true
};

// Create the stream.
var recognizeStream = speech_to_text.createRecognizeStream(params);

// Pipe in the audio.
fs.createReadStream('audio-file.wav').pipe(recognizeStream);

// Pipe out the transcription to a file.
recognizeStream.pipe(fs.createWriteStream('transcription.txt'));

// Get strings instead of buffers from 'data' events.
recognizeStream.setEncoding('utf8');

// Listen for events.
recognizeStream.on('data', function(event) { onEvent('Data:', event); });
recognizeStream.on('results', function(event) { onEvent('Results:', event); });
recognizeStream.on('error', function(event) { onEvent('Error:', event); });
recognizeStream.on('close-connection', function(event) { onEvent('Close:', event); });

// Displays events on the console.
function onEvent(name, event) {
    console.log(name, JSON.stringify(event, null, 2));
};








  if(checkIncident(data)){
  
    if (data.entities[0].entity == "emergency"){

      emergency_type = data.entities[0].value;
      console.log(emergency_type);
    }  
    console.log(data)

    var params = [];
    
    create_datastruct_if_appropriate(data);


    if(data.context.current_patient != null){
      
      current_patient = data.context.current_patient;
      
      //we are still collecting data on patients
      if (current_patient <= total_number_injured){
        



        update_data_struct(data);
        assign_tag(data);

        var user_prompt = "Ok, let's deal with patient " + current_patient.toString() + ". Please give the gender, age, and name of the patient";
        params.push(user_prompt);

        if (current_patient < total_number_injured && patient_data_array[current_patient-1]["patient_description"] != null){
          var prompt_2 = "Thank you, this patient's data has been stored, let's continue with the next patient. "
          params.push(prompt_2);
        }
        else{
          var prompt_2 = "";
          params.push(prompt_2);
        }

      }

      //we have looped through all patients
      else{
        var user_prompt = "Thank you, we have received your assessment of each of the " + total_number_injured.toString() + " patients and the data has been sent to your local emergency room and inbound first responders";
        params.push(user_prompt);
        console.log(patient_data_array);
        var prompt_2 = "";
        params.push(prompt_2);


        var url = "http://cs.dartmouth.edu/~egreene/hospital.php?";
        var json_array = JSON.stringify(patient_data_array);

        var http_params = "emergency=" + emergency_type + "&ptArray=" + json_array + "&additional=" + additional_information;
        var combined = url + http_params;
        open(combined);
        // console.log("HTTP PARAMS BELOW HTTP PARAMS BELOW HTTP PARAMS BELOW HTTP PARAMS BELOW")
        // console.log(http_params);
        // var xhr = new XMLHttpRequest();
        // xhr.open("POST", url, true);

        // //Send the proper header information along with the request
        // xhr.setRequestHeader("Content-type", "application/x-www-form-urlencoded");

        // xhr.send(http_params);





      }        
    }


    console.log("PATIENT DATA ARRAY BELOW");
    console.log(patient_data_array);
    // if (patient_data_array != null){
    //   patient_data_array[0]["TEST"] = "VALUE";
    //   patient_data_array[1]["TEST2"] = "VALUE2";
    // }
    

    //Store triage tag assigned to patient if appropriate
    // if (data.context.tag != null){
    //   patient_data_array[current_patient]["tag"] = data.context.tag;
    // }


    data.output.text = replaceParams(data.output.text, params);


    return res.json(data);

  }
  else{
    return res.json(data);
  }
}

function assign_tag(data){
  if(data.context.tag != null){
    patient_data_array[current_patient-1]["tag"] = data.context.tag;
  }
}



function update_data_struct(data){

  if (data.context.current_question != null){

    var index = current_patient - 1;

    switch (data.context.current_question){
  

      //NEED FUNCTION THAT LOOKS IN ENTITY LIST A RETURNS INDEX OF DESIRED ENTITY
      //NEED FUNCTION THAT LOOKS IN ENTITY LIST A RETURNS INDEX OF DESIRED ENTITY
      //NEED FUNCTION THAT LOOKS IN ENTITY LIST A RETURNS INDEX OF DESIRED ENTITY
      //NEED FUNCTION THAT LOOKS IN ENTITY LIST A RETURNS INDEX OF DESIRED ENTITY

      

      case "patient_description":
        // identify the entity of interest for this case
        // store the entity value either directly or as a 1/0 in the appropriate spot in the 2D array
        patient_data_array[index]["patient_description"] = data.context.description;
        //ALSO STORE GENDER AND AGE IF AVAILABLE
        break;


      case "walking":
        
        patient_data_array[index]["Walking"] = data.entities[0].value;        
        break;

      case "breathing":

        patient_data_array[index]["Breathing"] = data.entities[0].value;
        break;

      case "breath_per_minute":

        patient_data_array[index]["Breath_per_minute"] = data.entities[0].value;
        break;

      case "pulse":

        patient_data_array[index]["Pulse"] = data.entities[0].value;
        break;

      case "mental_state_1":

        patient_data_array[index]["mental_state_1"] = data.entities[0].value;
        break;

      case "mental_state_2":

        patient_data_array[index]["mental_state_2"] = data.entities[0].value;
        break;

      case "mental_state_3":

        patient_data_array[index]["mental_state_3"] = data.entities[0].value;
        break;

      case "awake":

        patient_data_array[index]["Awake"] = data.entities[0].value;
        break;

      case "complaint":

        patient_data_array[index-1]["Complaint"] = data.entities[0].value + ": " + data.context.complaint;
        break;

      case "additional":

        additional_information = data.context.additional;
        console.log(additional_information);
        
    }
  
  }

}


function create_datastruct_if_appropriate(data){
  if(data.context.total_number_injured != null){
      console.log("IN HERE")
      if(initialized==0){
        total_number_injured = data.context.total_number_injured;
        patient_data_array = make2dArray(total_number_injured);
        initialized = 1;
        console.log("Case 1");
      }
      else{
        if(total_number_injured == data.context.total_number_injured){
          
          //THIS IS AN ISSUE WHAT DO WE DO IF THERE'S A NEW PROCESS WITH SAME NUMBER AS BEFORE....?? 
          //ISSUE BECAUSE OVERWRITING WONT WORK SINCE IT LEAVES OLD DATA IN PLACE

          //BUT OK IF JUST CONTINUING AN ONGOING TRIAGE PROCESS... I.E. NEED TO DISTINGUISH BETWEEN ONGOING AND NEW

          console.log("Case 2");
        }
        else{
          total_number_injured = data.context.total_number_injured;
          //REINITIALIZE THE ARRAY WITH THIS NEW SIZE 
          patient_data_array = make2dArray(total_number_injured);
          console.log("Case 3");
        }
      }
    }
}


function make2dArray(num_patients){
  var main_array = new Array(num_patients);
  for(var i = 0; i < num_patients; i++){
      var sub_array = {};
      main_array[i] = sub_array;
  }
  return main_array;
}


// function make2dArray(num_patients, num_datapoints){
//   var main_array = new Array(num_patients);
//   for(var i = 0; i < num_patients; i++){
//       var sub_array = new Array(num_datapoints);
//       main_array[i] = sub_array;
//   }
//   return main_array;
// }


function generate_message_for_hospital(data){

}

function checkIncident(data){
  return data.intents && data.intents.length > 0 && data.intents[0].intent === 'emergency'
    // && data.entities && data.entities.length > 0 && data.entities[0].entity === 'day';
}

function replaceParams(original, args){
  if(original && args){
    var text = original.join(' ').replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
        ;
    });
    return [text];
  }
  return original;
}

function getLocationURL(lat, long){
  if(lat != null && long != null){
    return '/api/' + key + '/geolookup/forecast/q/'  + long + ',' + lat + '.json';
  }
};

var key ="f5b1daec4a042698";
//var key ="bb49271ef8f788f2";


if ( cloudantUrl ) {
  // If logging has been enabled (as signalled by the presence of the cloudantUrl) then the
  // app developer must also specify a LOG_USER and LOG_PASS env vars.
  if ( !process.env.LOG_USER || !process.env.LOG_PASS ) {
    throw new Error( 'LOG_USER OR LOG_PASS not defined, both required to enable logging!' );
  }
  // add basic auth to the endpoints to retrieve the logs!
  var auth = basicAuth( process.env.LOG_USER, process.env.LOG_PASS );
  // If the cloudantUrl has been configured then we will want to set up a nano client
  var nano = require( 'nano' )( cloudantUrl );
  // add a new API which allows us to retrieve the logs (note this is not secure)
  nano.db.get( 'car_logs', function(err) {
    if ( err ) {
      console.error(err);
      nano.db.create( 'car_logs', function(errCreate) {
        console.error(errCreate);
        logs = nano.db.use( 'car_logs' );
      } );
    } else {
      logs = nano.db.use( 'car_logs' );
    }
  } );

  // Endpoint which allows deletion of db
  app.post( '/clearDb', auth, function(req, res) {
    nano.db.destroy( 'car_logs', function() {
      nano.db.create( 'car_logs', function() {
        logs = nano.db.use( 'car_logs' );
      } );
    } );
    return res.json( {'message': 'Clearing db'} );
  } );

  // Endpoint which allows conversation logs to be fetched
  app.get( '/chats', auth, function(req, res) {
    logs.list( {include_docs: true, 'descending': true}, function(err, body) {
      console.error(err);
      // download as CSV
      var csv = [];
      csv.push( ['Question', 'Intent', 'Confidence', 'Entity', 'Output', 'Time'] );
      body.rows.sort( function(a, b) {
        if ( a && b && a.doc && b.doc ) {
          var date1 = new Date( a.doc.time );
          var date2 = new Date( b.doc.time );
          var t1 = date1.getTime();
          var t2 = date2.getTime();
          var aGreaterThanB = t1 > t2;
          var equal = t1 === t2;
          if (aGreaterThanB) {
            return 1;
          }
          return  equal ? 0 : -1;
        }
      } );
      body.rows.forEach( function(row) {
        var question = '';
        var intent = '';
        var confidence = 0;
        var time = '';
        var entity = '';
        var outputText = '';
        if ( row.doc ) {
          var doc = row.doc;
          if ( doc.request && doc.request.input ) {
            question = doc.request.input.text;
          }
          if ( doc.response ) {
            intent = '<no intent>';
            if ( doc.response.intents && doc.response.intents.length > 0 ) {
              intent = doc.response.intents[0].intent;
              confidence = doc.response.intents[0].confidence;
            }
            entity = '<no entity>';
            if ( doc.response.entities && doc.response.entities.length > 0 ) {
              entity = doc.response.entities[0].entity + ' : ' + doc.response.entities[0].value;
            }
            outputText = '<no dialog>';
            if ( doc.response.output && doc.response.output.text ) {
              outputText = doc.response.output.text.join( ' ' );
            }
          }
          time = new Date( doc.time ).toLocaleString();
        }
        csv.push( [question, intent, confidence, entity, outputText, time] );
      } );
      res.csv( csv );
    } );
  } );
}

module.exports = app;
