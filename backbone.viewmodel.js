/**
 * @module Backbone.ViewModel
 * @author matthew davidson
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['backbone','underscore','jquery'], factory);
    } else if (typeof exports === 'object') {
        module.exports = factory(require('backbone'),require('underscore'),require('jquery'));
    } else {
        factory(root.Backbone, root._, root.jQuery);
    }
}(this, function (Backbone, _, $) {
    


    /**
     * TODO: filters, 
     * processing data-on directive with parameters 
     * e.g. data-on="click:func($event,$data)"
     * data-if, data-repeat, data-style, data-attr.
     * Also, a lot of testing.  
     * Eliminate memory leaks.
     * Write a lightweight parser & lexer.  
     * Better errors.  
     */
    



    var View = Backbone.View,
        Model = Backbone.Model,
        Collection = Backbone.Collection;

    if(!Backbone.$) Backbone.$ = $;


    var statics = {},
        proto = {},
        helpers = {},
        defaults = {
            methods:{},
            data:{},
            virtuals:{},
            lazy:true
        },
        ViewModel;
    
    // If 'lazy' is set to 'false', bindings will update on 'keyup'



    



    /**
     * Construct a model or collection from data, unless the object is already a model or collection.
     * @param  {String} type 'Model/Collection'
     * @param  {[type]} data [description]
     * @return {[type]}      [description]
     * @api private
     */
    helpers.construct = function constructBackboneData(type,data) {

        // FIXME: this should be done better.
        if((['Model','Collection'].indexOf(type) === -1)) {
            throw new Error('Must be a Backbone.Model or Backbone.Collection');
        }

        if(data instanceof Model || data instanceof Collection) {
            return data;
        } else {
            return new Backbone[type](data);
        }

    };



    /**
     * use ES5 getters and setters on models.  Because they are awesome.
     * @param  {Model} model 
     * @return {MoreAwesomeModel}
     */
    helpers.proxyAttributes = function ( model ) {
        
        return _.each(model.attributes, _.bind(function (prop){
            if(!model[prop] && model.get(prop)) {
                Object.defineProperty(model,prop,{
                    get:function(){
                        return model.get(prop);
                    },
                    set:function(val){
                        return model.set(prop,val);
                    }
                });
            }
        },model));

    };





    /* Helpers */




    /* @api private. */
    helpers.falsy = function (v) {
        return typeof v === 'undefined' || !v || v === 'false';
    };




    /* @api private. */
    helpers.truthy = function (v) {
        return !helpers.falsy(v);
    };




    /**
     * Define virtual properties on Model
     * @param  {Model} obj      
     * @param  {String} propName 
     * @param  {Mixed} opts     if Object, should be the same options as passed to Object.defineProperty
     * @api private
     */
    helpers.virtualize = function defineVirtual ( obj, propName, opts ) {

        if(_.isFunction(opts)) {
            return Object.defineProperty(obj,propName,{
                get:opts
            });
        }
        if(opts && _.isObject(opts) && (opts.get || opts.set)) {
            return Object.defineProperty(obj,propName,opts);
        }
        return Object.defineProperty(obj, propName,{
            value:opts,
            configurable:true
        });
    };

    


    /**
     * return the key for the model.  
     * @param  {String} key 
     * @return {String}     
     */
    
    helpers.attr = function (key) {
        return key.split('.').slice(1).join('.') || key;
    };
    

    /* rip a native function out of context.  mainly for making iterators.  */
    helpers.demethodize = Function.prototype.bind.bind(Function.prototype.call);

    /* unbind all the event listeners.  use as iterator.  */
    helpers.unlisten = helpers.demethodize(Backbone.Events.stopListening);




    /**
     * ViewModel constructor
     * @return {ViewModel} 
     */
    proto.constructor = function ViewModel() {
        
        this.$data = {
            $root:new Model()
        };

        _.extend(this,defaults);

        View.apply(this, arguments);
        
    };



    
    /* Instance methods */




    /**
     * The initialize function.
     * @param  {Object} opts 
     * @return {ViewModel}
     */
    proto.initialize = function init(opts) {

        View.prototype.initialize.apply(this,arguments);

        _.extend(this,opts);
        var render = this.render;
        this.render = function(){
            render.apply(this,arguments);
            this.trigger('rendered');
        };
        this.trigger('rendered');

        this.$el.find('[data-show]').each(_.bind(this.bindVisibility,this));
        
        var attributesToBind =  _.uniq(
                _.keys(this.data).concat(
                    _.map($.makeArray($('[data-model]')),function(e){
                        return $(e).data('model').toString();
                    })
                )
            );

        _.each(attributesToBind,_.bind(this.registerData,this));
        
        this.trigger('bound:data');

        this.applyVirtuals();

        this.trigger('bound:virtuals');
        
        this.render();

        this.trigger('rendered');


        this.$el.find('[data-on]').each(_.bind(this.bindHandlers,this));
        this.$el.find('[data-text],[data-html],[data-repeat]').each(_.bind(this.bindReader,this));
        
        this.trigger('ready');
        return this;
    };
    /**
     * Programmatically define events.
     * @return {Object} the event hash.
     */
    proto.events = function () {

        var trigger = this.lazy ? 'change' : 'keyup';
        
        var events = {};

        events[trigger.concat(' textarea[data-model],input[data-model]')] = 'updateValue';

        return _.extend ({
            'change select[data-model]':'updateValue'
        },events);

    };

    /**
     * clean up.
     * @return {ViewModel} 
     */
    proto.destroy = function () {
        
        _.each(this.$data,helpers.unlisten);

        this.remove();

    };




    /**
     * set up virtual getters/setters 
     * @return {ViewModel} chainable
     */
    proto.applyVirtuals = function() {
        var virtuals = this.virtuals;
        for(var key in virtuals) {
            var model = this.$data[key];
            if(!model) {
                helpers.virtualize(this.$data.$root,virtuals[key]);
            } else {
                for(var k in virtuals[key]) {
                    helpers.virtualize(model,k,virtuals[key][k]);
                }
            }
        }
        return this;
    };




    /**
     * subscribe the element to the model attribute's value
     * @param {DOMElement} el      
     * @param {String} the element's attribute    
     * @param {String} keypath the model keypath
     */
    proto.addReader = function ( el, attr, keypath ) {
        var model = this.$observer(keypath),
            $el = $(el),
            path = helpers.attr(keypath);

        this.listenTo(model,'change:'+path, function (){
            $el[attr].call($el,model.get(path));
        });

        return this;
    };




    /**
     * Create models and collections from this.data
     * @param  {String} key alias
     * @return {ViewModel}     
     */
    proto.registerData = function registerData(key){
        this.data = this.data || {};
        var data = this.data,
            model,
            $root = this.$data.$root;

        if(!data[key] || _.isString(data[key]) || _.isNumber(data[key]) || _.isBoolean(data[key])) {
            $root.set(key,data[key]);
            helpers.proxyAttributes($root);
            $root.on('change', function (){
                helpers.proxyAttributes($root);
            });
            return this;
        }
        if(_.isArray(data[key])) {            
            model = helpers.construct('Collection',data[key]);
        } else {
            if(_.isObject(data[key])) {
                model = helpers.construct('Model',data[key]);
            } 
        }
        helpers.proxyAttributes(model);
        if(model && model.on) {
            model.on('change',function(){
                helpers.proxyAttributes(model);
            });
        }
        this.$data[key] = model;
        return this;
    };




    /**
     * returns the current model/collection for the keypath, or the root model if not found.
     * @param  {String} key 
     * @return {Mixed}     Model/Collection
     */
    proto.$observer = function (key) {
        return this.$data[key.split('.').shift()] || this.$data.$root;
    };




    /**
     * set up data-show bindings
     * @param  {Number} i  
     * @param  {DOMElement} el
     * @return {ViewModel}    
     */
    proto.bindVisibility = function ( i, el ) {
        
        var path = $(el).data('show');

        this.listenTo(this.$observer(path),'change:'+helpers.attr(path), function(model,val){
            if (helpers.truthy(val)) $(el).show();
            else $(el).hide();
        });

        return this;
    };




    /**
     * Find the model/collection for the given keypath and return the referenced value.
     * @param  {String} keypath 
     * @return {Mixed}         
     */
    proto.$get = function (keypath) {
        return this.$observer(keypath).get(helpers.attr(keypath)) || (this.$observer(keypath))[helpers.attr(keypath)] || JSON.stringify(this.$observer.attributes);
    };




    /**
     * Find the model/collection for the given keypath and update the value at the given keypath
     * @param {String} keypath 
     * @param {Mixed} val     the value to set
     */
    proto.$set = function (keypath,val) {
        this.$observer(keypath).set(helpers.attr(keypath,val));
        return this;
    };



    /**
     * bind events in data-on to the vm context
     * @param  {Number} i  
     * @param  {DOMElement} el 
     * @return {ViewModel}    
     */
    proto.bindHandlers = function (i, el ) {

        var params = el.dataset.on;
        var result = /[\(\)]/.exec(params);
        /* will implement this soon. */
        if(result) {
            console.warn('not set up to handle parameters in event handler bindings.',result);
            return;
        }

        var args = params.split(','),
            _this = this,
            methods = this.methods;

        _.each(args, function(meth){

            var parts = meth.split(':'),
                label = parts.shift(),
                handler = parts.shift();
            
            if(!(handler in methods)) {
                console.warn(handler + ' is not a registered method');
            } else {
            _this.$(el).on(label,function(){
                methods[handler].apply(_this,arguments);
            }); 
            }
        });

        return this;

    };



    /**
     * subscribe an element to changes on a model/collection
     * @param  {Number} i  
     * @param  {DOMElement} el 
     * @return {ViewModel}    
     */
    proto.bindReader = function (i,el) {

        var properties = Object.keys(el.dataset),
            $el = $(el);

        _.each(properties, _.bind(function(prop){

            var path = $el.data(prop);

            (prop in $el && $el[prop]).call($el,this.$get(path));
            this.addReader(el,prop,path);

        },this));

        return this;

    };



    /**
     * update the value on a model/collection
     * @param  {Event} e 
     * @return {ViewModel}   
     */
    proto.updateValue = function(e){
        var target = e.target,
            key = $(target).data('model'),
            path = helpers.attr(key),
            model = this.$observer(key),
            alias = key.split('.').shift();

        var value = target.isContentEditable ? target.innerHTML : target.value;
        if(value != model.get(path)) {
            $('[data-model="'+key+'"]').val(value);
            model.set(path,value);
            this.trigger('change:'+alias.concat(':').concat(path));
        }
        return this;
    };    
    


    _.each(['demethodize','construct','virtualize','proxyAttributes'], function(key){
        statics[key] = helpers[key];
    });

    


    ViewModel = Backbone.ViewModel = View.extend(proto,statics);




    return ViewModel;




}));