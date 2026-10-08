import registry from './languages.json';
import english from './en.json';
import { startI18n } from './runtime.js';
import { startLanguagePicker } from './picker.js';

const bootstrap = window.PyPathI18nConfig || { registry, english };
window.PyPathI18nConfig = bootstrap;
startI18n(bootstrap);
startLanguagePicker();
