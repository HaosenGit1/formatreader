import './style.css';
import { allViewers } from './categories';
import { startApp } from './core/shell';
import { registerOffline } from './offline/register';

startApp(allViewers);
registerOffline();
