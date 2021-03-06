var chai      = require('chai');
var expect    = chai.expect;
var sinon     = require('sinon');
var sinonChai = require('sinon-chai');
chai.use(sinonChai);

var vm = require('vm');
var fs = require('fs');
var module_code = fs.readFileSync(__dirname + '/../runtime_library/module.js', { encoding: 'utf8' });

function getNewModuleVersion(context){
  vm.runInNewContext(module_code, context);
  return context;
}

describe('Runtime Library module', function(){

  describe('require', function(){

    it('should respond with an error if the identifier is neither a module, nor a javascript or JSON file', function(){
      var context = { __readFileSync: sinon.stub() };
      var module = getNewModuleVersion(context);
      expect(function(){ module.require('./test.txt'); }).to.throw(/require can only be used to load modules, javascript files, and JSON files/);
    });

    it('should use __readFileSync to check if the module_identifier is a module', function(){
      var context = { __readFileSync: sinon.stub() , console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/module_id/codius-manifest.json').returns('{ "main": "main.js" }')
      context.__readFileSync.withArgs('codius_modules/module_id/main.js').returns('module.exports={}')
      var module = getNewModuleVersion(context);
      var test_module = module.require('module_id');
      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/module_id/main.js');
    });

    it('should call __readFileSync for plain file names', function(){
      var context = { __readFileSync: sinon.stub() , console: { log: console.log } };
      context.__readFileSync.withArgs('./file.js').returns('module.exports={ global_data: "Hello World!" }');
      var module = getNewModuleVersion(context);
      var file = module.require('./file.js');
      expect(context.__readFileSync).to.have.been.calledOnce;
      expect(context.__readFileSync.firstCall.args).to.deep.equal(['./file.js']);
    });

    it('should eval and extract the module.exports from javascript files', function(){
      var context = { __readFileSync: sinon.stub() , console: { log: console.log } };
      context.__readFileSync.withArgs('./file.js').returns('module.exports={ global_data: "Hello World!" }');
      var module = getNewModuleVersion(context);
      var test_module = module.require('./file.js');
      expect(context.__readFileSync).to.have.been.calledOnce;
      expect(test_module).to.have.property('global_data', 'Hello World!');
    });

    it('should parse json files', function(){
      var context = { __readFileSync: sinon.stub() };
      context.__readFileSync.returns('{"test":[1,2],"a":"b","c":{"d":-1}}');
      var module = getNewModuleVersion(context);

      var test_module = module.require('test.json');
      expect(test_module).to.deep.equal({
        test: [1, 2],
        a: 'b',
        c: { d: -1 }
      });
    });

    it('should request the correct paths within submodules', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/a/codius-manifest.json').returns('{"modules":{"b":"hash"}, "main": "main.js"}');
      context.__readFileSync.withArgs('codius_modules/a/main.js').returns('module.exports=require("b");');
      context.__readFileSync.withArgs('codius_modules/a/codius_modules/b/codius-manifest.json').returns('{"main":"main.js"}');
      context.__readFileSync.withArgs('codius_modules/a/codius_modules/b/main.js').returns('module.exports={}');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/a/codius_modules/b/main.js');
    });

    it('should request the correct paths within subfolders', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./lib/test.js').returns('module.exports=require("./other_test.js")');

      var module = getNewModuleVersion(context);
      var a = module.require('./lib/test.js');

      expect(context.__readFileSync).to.be.calledTwice;
      expect(context.__readFileSync.secondCall.args).to.deep.equal(['./lib/other_test.js']);
    });

    it('should request the correct paths for specific files required from submodules', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/a/codius-manifest.json').returns('{"main":"index.js"}');
      context.__readFileSync.withArgs('codius_modules/a/index.js').returns('module.exports=require("./codius_modules/b/lib/test.js")');
      context.__readFileSync.withArgs('codius_modules/a/codius_modules/b/codius-manifest.json').returns('{"files":["lib/test.js"]}');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/a/codius_modules/b/lib/test.js');
    });

    it('should support ".." to require something from a parent module', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/a/codius-manifest.json').returns('{"main":"index.js","files":{"index.js":"hash1","other.js":"hash2"}}');
      context.__readFileSync.withArgs('codius_modules/a/index.js').returns('module.exports=require("b");');
      context.__readFileSync.withArgs('codius_modules/a/codius_modules/b/codius-manifest.json').returns('{"main":["main.js"]}');
      context.__readFileSync.withArgs('codius_modules/a/codius_modules/b/main.js').returns('module.exports=require("../other.js");');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/a/other.js');
    });

    it('should support ".." to require something from a parent directory', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/a/codius-manifest.json').returns('{"main":"lib/index.js","files":{"lib/index.js":"hash1","other.js":"hash2"}}');
      context.__readFileSync.withArgs('codius_modules/a/lib/index.js').returns('module.exports=require("../other.js");');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/a/other.js');
    });

    it('should look for an "index.js" file in a required directory', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('codius_modules/a/codius-manifest.json').returns('{"main":"main.js","files":{"lib/index.js":"hash1","main.js":"hash2"}}');
      context.__readFileSync.withArgs('codius_modules/a/main.js').returns('module.exports=require("./lib");');
      context.__readFileSync.withArgs('codius_modules/a/lib/index.js').returns('');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(context.__readFileSync).to.have.been.calledWith('codius_modules/a/lib/index.js');
    });

    it('should cache javascript file exports so they are not overwritten on subsequent require calls', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./a.js').returns('module.exports={a: 1}');
      context.__readFileSync.withArgs('./b.js').returns('var a = require("./a"); a.b = 2;');

      var module = getNewModuleVersion(context);
      var a = module.require('./a');
      module.require('./b');

      expect(a).to.haveOwnProperty('b');
      expect(a.b).to.equal(2);
    });

    it('should find node_modules in the same folder, three levels deep', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./codius_modules/express/package.json').returns('{ "main": "index.js" }');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/package.json').returns('{ "main": "index.js" }');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/debug.js').returns('module.exports=require("ms");');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/node_modules/ms/package.json').returns('{ "main": "index.js" }');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/node_modules/ms/index.js').returns('');

      var module = getNewModuleVersion(context);
      module.require('./codius_modules/express/node_modules/debug/debug.js');

      expect(context.__readFileSync).to.have.been.calledWith('./codius_modules/express/node_modules/debug/node_modules/ms/index.js');
    });

    it('should look for a file if the string starts with a "./"', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./a.js').returns('module.exports={found: "file"}');
      context.__readFileSync.withArgs('./codius_modules/a').returns('module.exports={found:"module"}');

      var module = getNewModuleVersion(context);
      var a = module.require('./a');

      expect(a).to.haveOwnProperty('found');
      expect(a.found).to.equal('file');
    });

    it('should look for a module if the string does not start with a "./"', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./a.js').returns('module.exports={found: "file"}');
      context.__readFileSync.withArgs('./codius_modules/a').returns('module.exports={found:"module"}');

      var module = getNewModuleVersion(context);
      var a = module.require('a');

      expect(a).to.haveOwnProperty('found');
      expect(a.found).to.equal('module');
    });

    it('should look for a file if the string starts with a "./", even when it is deep in the tree', function(){
      var context = { __readFileSync: sinon.stub(), console: { log: console.log } };
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/package.json').returns('{ "main": "node.js" }');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/node.js').returns('module.exports=require("./debug")');
      context.__readFileSync.withArgs('./codius_modules/express/node_modules/debug/debug.js').returns('module.exports={ found: "yay" }');

      var module = getNewModuleVersion(context);
      var a = module.require('./codius_modules/express/node_modules/debug');

      console.log(context.__readFileSync.args);

      expect(a).to.haveOwnProperty('found');
      expect(a.found).to.equal('yay');
    });

  });

});
