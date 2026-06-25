import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  override columnName(
    propertyName: string,
    customName: string,
    embeddedPrefixes: string[],
  ): string {
    return customName ? customName : this.camelToSnake(propertyName);
  }

  override joinColumnName(
    relationName: string,
    referencedColumnName: string,
  ): string {
    return this.camelToSnake(relationName + '_' + referencedColumnName);
  }

  override joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
    secondPropertyName: string,
  ): string {
    return this.camelToSnake(
      firstTableName +
        '_' +
        secondTableName +
        '_' +
        firstPropertyName +
        '_' +
        secondPropertyName,
    );
  }

  override relationName(propertyName: string): string {
    return this.camelToSnake(propertyName);
  }
}
