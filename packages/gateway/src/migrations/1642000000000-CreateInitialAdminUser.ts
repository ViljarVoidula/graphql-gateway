import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from "bcrypt";

export class CreateInitialAdminUser1642000000000 implements MigrationInterface {
    name = 'CreateInitialAdminUser1642000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Check if admin user already exists
        const existingAdmin = await queryRunner.query(
            `SELECT id FROM "user" WHERE email = $1 LIMIT 1`,
            [process.env.ADMIN_EMAIL]
        );

        if (existingAdmin.length > 0) {
            console.log('Admin user already exists, skipping creation');
            return;
        }

        // Get admin password from environment variable
        const adminPassword = process.env.ADMIN_PASSWORD;
        if (!adminPassword) {
            throw new Error('ADMIN_PASSWORD environment variable is required for creating initial admin user');
        }

        // Hash the password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(adminPassword, saltRounds);

        // Create admin user
        await queryRunner.query(
            `INSERT INTO "user" (
                id, 
                email, 
                password, 
                permissions, 
                "isEmailVerified", 
                "failedLoginAttempts", 
                "createdAt", 
                "updatedAt"
            ) VALUES (
                gen_random_uuid(),
                $1,
                $2,
                $3,
                true,
                0,
                NOW(),
                NOW()
            )`,
            [
                process.env.ADMIN_EMAIL,
                hashedPassword,
                'admin,user' // Admin has both admin and user permissions
            ]
        );

        console.log(`✅ Created initial admin user: ${process.env.ADMIN_EMAIL}`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove the admin user
        await queryRunner.query(
            `DELETE FROM "user" WHERE email = $1`,
            [process.env.ADMIN_EMAIL]
        );

        console.log(`🗑️  Removed admin user: ${process.env.ADMIN_EMAIL}`);
    }
}
