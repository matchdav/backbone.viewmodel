# backbone.viewmodel
minimal viewmodels for backbone

*wip* - not stable yet.

## why

Knockout and Vue and Angular are sometimes a lot more than I need.  I just want a simple set of 2-way bindings registered to my models.

## what

uses data-model, data-text and data-html attributes to bind model values.

## how

Pass in your models into the data hash,

e.g. 

```javascript
var vm = new ViewModel({
  data:{
    //can pass a Backbone model or plain object
    user:{
      name:'dave'
    }
  },
  methods: {
    sayHi:console.log.bind(console,'hi')
  }
});
```

And then in your html or template:

```html
<input data-model="user.name" type="text" />
<p data-text="user.name"></p>
<button data-on="click:sayHi">Say Hi</button>
```

In progress: data-show, data-if, data-repeat
