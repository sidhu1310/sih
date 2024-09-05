[![HitCount](http://hits.dwyl.io/JayaKrishnaNamburu/voice-to-text.svg)](http://hits.dwyl.io/JayaKrishnaNamburu/voice-to-text)

# Voice To Text

voice-to-text is a wrapper around `webkitSpeechRecognition` API, which is supports Angular 4+ Applications.

Run `npm i voice-to-text` for installing.

Import and add InputModule in your app module.

`import { InputModule } from 'voice-to-text';`

Declare as

`<app-input (error)="onError($event)" (spokenText)="response($event)"></app-input>`

`spokenText` triggers should be tagged to a event in your component so, when the API gets any input it invokes the text in your listener and similarly when there is any error `error` gets triggered.

`showInput` flag is used to hide are display the input box, by default it is true.

`<app-input showInput = false (error) = "onError($event)" (spokenText) = "response($event)"></app-input>`

[![NPM](https://nodei.co/npm/voice-to-text.png)](https://npmjs.org/package/voice-to-text)
