import bcrypt from 'bcryptjs';

const password = 'wlsdyd76!!';
const saltRounds = 10;

bcrypt.hash(password, saltRounds, function(err, hash) {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('Password:', password);
    console.log('Bcrypt hash:', hash);
    console.log('\nSQL UPDATE command:');
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE username = 'fish7933';`);
  }
});