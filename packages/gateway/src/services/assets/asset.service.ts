import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { dataSource } from '../../db/datasource';
import { Asset } from '../../entities/asset.entity';

@Service()
export class AssetService {
  private repo: Repository<Asset>;
  constructor() {
    this.repo = dataSource.getRepository(Asset);
  }

  async put(key: string, contentType: string, data: Buffer): Promise<Asset> {
    let existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      existing.contentType = contentType;
      existing.data = data;
      return this.repo.save(existing);
    }
    const created = this.repo.create({ key, contentType, data });
    return this.repo.save(created);
  }

  async get(key: string): Promise<Asset | null> {
    return this.repo.findOne({ where: { key } });
  }
}
