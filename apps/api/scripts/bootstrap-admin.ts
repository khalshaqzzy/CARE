import { loadLocalEnv } from '../src/load-local-env';
import { bootstrapAdmin } from '../src/operations/bootstrap-admin';

loadLocalEnv();
void bootstrapAdmin();
