export class PrivacyMasker {
  static maskEmail(email) {
    return email;
  }

  static maskIBAN(iban) {
    return iban;
  }

  static maskCryptoAddress(address) {
    return address;
  }

  static reassurance(type) {
    return `Reassurance for ${type}`;
  }
}
