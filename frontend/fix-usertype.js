// Quick Fix Script to Add userType to Existing Customer Session
// Run this in the browser console if you don't want to log out/in

const userData = JSON.parse(localStorage.getItem('userData') || '{}');
if (userData && userData.id && !userData.userType) {
    userData.userType = 'Customer';
    localStorage.setItem('userData', JSON.stringify(userData));
    console.log('✅ Updated userData with userType:', userData);
    console.log('🔄 Please refresh the page to see your orders!');
} else if (userData.userType) {
    console.log('✅ userType already exists:', userData.userType);
} else {
    console.log('❌ No user data found. Please log in.');
}
