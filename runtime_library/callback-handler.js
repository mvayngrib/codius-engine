// Module is wrapped in self-invoking function so that
// other sandboxed code does not have direct access
// to the CallbackHandler. Instead, sandboxed code should
// use the global postMessage command that overwritten by
// a modified version when this file is loaded into the sandbox
(function(context){
  'use strict';

  /**
   *  Replace the global postMessage and onmessage functions
   *  with the replacements defined here that handle callbacks as well.
   *
   *  Note that addCallbacksToIPCMessaging is invoked at the bottom of this file.
   */
  function addCallbacksToIPCMessaging() {
    var callback_handler = new CallbackHandler(context);

    // Overwrite global postMessage
    context.postMessage = callback_handler.postMessageWithCallback.bind(callback_handler);
  }

  /**
   *  Class that maintains the callback array and
   *  references to the original postMessage and onmessage
   */
  function CallbackHandler(context) {
    var self = this;

    // Store original functions
    self._postMessage_original = context.postMessage;
    self._onmessage_original   = context.onmessage;

    self._callback_array = [];
    self._active_callbacks_count = 0;
  }

  /**
   *  Registers the given callback and calls the original postMessage
   *
   *  @param {String} message.module
   *  @param {String} message.method
   *  @param {String} message.data
   *  @param {Function} callback
   *
   *  @callback
   *  @param {Error} error
   *  @param {String} result
   */
  CallbackHandler.prototype.postMessageWithCallback = function(message, callback) {
    var self = this;

    if (typeof message !== 'object') {
      throw new Error('Message must be an object.');
    }

    if (typeof callback === 'function') {
      // Add the callback to the array
      self._callback_array.push(callback);
      self._active_callbacks_count += 1;
      var callback_index = self._callback_array.length - 1;

      // Add the callback_index to the message body
      message.callback = callback_index;
    }

    var message_string = JSON.stringify(message);

    if (typeof callback === 'function') {
      // Set the global onmessage to catch the response
      context.onmessage = self.onmessageCallbackHandler.bind(self);
    }

    self._postMessage_original(message_string);
  };

  /**
   *  Catch incoming messages and check whether they are
   *  intended to invoke callbacks.
   *
   *  @param {String} message.type
   *  @param {String} message.method
   *  @param {String} message.data
   *  @param {Function} callback
   *
   *  @callback
   *  @param {Error} error
   *  @param {String} result
   */
  CallbackHandler.prototype.onmessageCallbackHandler = function(message) {
    var self = this;

    // Message should be JSON object
    var message_body;
    try {
      message_body = JSON.parse(message);
    } catch(error) {
      throw new Error('Received invalid message: ' + error.name + ': ' + error.message);
    }

    var callback_index = message_body.callback;

    // If the message type is not a callback or the callback ID is not a number,
    // assume the message was not a result of a postMessageWithCallback call and
    // pass the message on to the original onmessage function
    if (message_body.type !== 'callback' || typeof callback_index !== 'number') {
      // throw new Error('Invalid callback: message.callback must be a number');
      if ('function' === typeof _onmessage_original) self._onmessage_original(message);
      return;
    }

    // Check that the callback_index is valid
    if (callback_index >= self._callback_array.length) {
      throw new Error('Invalid callback: array index out of bounds');
    } else if (self._callback_array[callback_index] === null) {
      throw new Error('Invalid callback: callback already called');
    } else if (typeof self._callback_array[callback_index] !== 'function'){
      throw new Error('Invalid callback: callback is not a function');
    }

    // Call the appropriate callback with the error
    // and results passed in with the message
    self._callback_array[callback_index](message_body.error, message_body.result);

    // Set that callback to null so it won't be called again
    self._callback_array[callback_index] = null;
    self._active_callbacks_count -= 1;

    self.checkFinished();
  };

  /**
   *  If there are no outstanding callbacks, set context.onmessage 
   *  to null so the sandbox knows the process is finished
   */
  CallbackHandler.prototype.checkFinished = function(){
    var self = this;

    if (self._active_callbacks_count === 0) {
      context.onmessage = null;
    }

    __check_finished();
  };

  addCallbacksToIPCMessaging();

})(this);
