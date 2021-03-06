(function(context){
  'use strict';

  // Overwrite require for input module (because it does not request an external file)
  var old_require = context.require;
  context.require = function(module_identifier) {
    if (module_identifier === 'input') {
      return new Input();
    } else {
      return old_require(module_identifier);
    }
  };

  function Input() {

  }

  Input.prototype.get = function(callback) {
    postMessage({
      api: 'input',
      method: 'get',
      data: ''
    }, callback);
  };

  Input.prototype.getJson = function(callback) {
    getInputData(function(error, data_string){
      if (error) {
        callback(error);
      } else {
        var json;
        try {
          json = JSON.parse(data_string);
        } catch (error) {
          callback(new Error('Error parsing input data as JSON: ' + error));
          return;
        }

        callback(null, json);
      }
    });
  };

})(this);