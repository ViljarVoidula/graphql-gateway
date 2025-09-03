import { Service } from 'typedi';
import { Repository } from 'typeorm';
import { dataSource } from '../db/datasource';
import { Application } from '../entities/application.entity';

@Service()
export class AuthorizationService {
  private applicationRepository: Repository<Application>;

  constructor() {
    this.applicationRepository = dataSource.getRepository(Application);
  }

  /**
   * Check if an application can access a specific service
   */
  async canApplicationAccessService(applicationId: string, serviceId: string): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['whitelistedServices']
    });

    if (!application) {
      return false;
    }

    // Check if the service is whitelisted for this application
    return application.whitelistedServices.some((service) => service.id === serviceId);
  }

  /**
   * Check if an application can access a service by URL
   */
  async canApplicationAccessServiceByUrl(applicationId: string, serviceUrl: string): Promise<boolean> {
    const application = await this.applicationRepository.findOne({
      where: { id: applicationId },
      relations: ['whitelistedServices']
    });

    if (!application) {
      return false;
    }

    return application.whitelistedServices.some((service) => service.url === serviceUrl);
  }
}
