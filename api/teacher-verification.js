import { automaticTeacherCheck } from '../server/automatic-teacher-verification.js';
import { createTeacherHandler } from '../server/teacher-verification-service.js';
import { getTeacherServices } from '../server/firebase-admin-services.js';

export default createTeacherHandler({ getServices: getTeacherServices, checkTeacher: automaticTeacherCheck });
