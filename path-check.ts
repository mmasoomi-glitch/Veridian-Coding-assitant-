// Check why the path detection might not be working
const testStr = "AWSXXXXXXXXXXXXXXXXXXXX/secret/key";

// Check file extensions
const hasExt = /\.(env|json|ya?ml|txt|cfg|conf|ini|toml|md|pem|key|ppk|pub)$/i.test(testStr);
console.log("Has known file extension:", hasExt);

// Check Windows drive
const hasWinDrive = /^[A-Za-z]:[\/]/.test(testStr);
console.log("Starts with Windows drive:", hasWinDrive);

// Check path starters
const hasPathStarter = /^(\.{0,2}[\/]|~[\/])/.test(testStr);
console.log("Starts with ./ or ../ or ~ or /:", hasPathStarter);

console.log("\nThis string looks like neither a path nor a known file extension.");
console.log("It contains '/' but the repair explicitly says: 'a mere embedded / no longer counts'");
console.log("Only a genuine path shape (with known ext, Windows drive, or Unix starter) is excused.");
console.log("\nSo 'AWSXXXX/secret/key' is CORRECTLY flagged as a high-entropy secret with /.");
console.log("This is NOT a bypass — it's the intended fix for R04 (AWS secrets with / are caught).");
