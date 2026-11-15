// Execute the browser algorithms without creating DOM/UI instances.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8').split('window.quietGrid =')[0];
const Engine = vm.runInNewContext(source + '\nClientAIEngine');
const cases = JSON.parse(fs.readFileSync(0, 'utf8'));
const results = cases.map(({state, actions}) => {
    let current = state;
    return actions.map(action => {
        try {
            current = Engine.processMove(current, action.direction, action.target);
            return {state: current};
        } catch (error) { return {error: error.message}; }
    });
});
process.stdout.write(JSON.stringify(results));
