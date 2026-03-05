import app from './../src/routes/routes.js';
import { withDb } from '../src/common/db.js';

app.use('*', withDb);

export default app;