import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsCiphertext(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCiphertext',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }
          const parts = value.split(':');
          if (parts.length !== 2) {
            return false;
          }
          const base64Regex =
            /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
          return base64Regex.test(parts[0]) && base64Regex.test(parts[1]);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} could not be processed securely. Please try again.`;
        },
      },
    });
  };
}
