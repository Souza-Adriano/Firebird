const Firebird = require('node-firebird');

export interface URI {
    pool?: number;
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    options?: ConnectionOptions;
}

export interface Options {
    lowercase_keys?: boolean;
    role?: string | null;
    pageSize?: number;
}

export interface ConnectionOptions {
    lowercase_keys: boolean;
    role: string | null;
    pageSize: number;
}

export interface ConnectionURI extends ConnectionOptions {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
}

export interface ConnPool {
    pool: number,
    URI: ConnectionURI
}

export interface IPool {
    query: (query: string, parameters: (string | number | boolean | null)[]) => Promise<any[]>;
    execute: (query: string, parameters: (string | number | boolean | null)[]) => Promise<any[]>;
    sequentially: (query: string, parameters: (string | number | boolean | null)[], fn: (row: any, index: number) => void) => Promise<void>;
    close: () => Promise<void>;
    transaction: (isolation: Transactions) => Promise<Transaction>;
}

export interface Transaction {
    query: (query: string, parameters: (string | number | boolean | null)[]) => Promise<any[]>;
    execute: (query: string, parameters: (string | number | boolean | null)[]) => Promise<any[][]>;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
}

enum Transactions {
    ISOLATION_READ_UNCOMMITTED = Firebird.ISOLATION_READ_UNCOMMITTED,
    ISOLATION_READ_COMMITED = Firebird.ISOLATION_READ_COMMITED,
    ISOLATION_REPEATABLE_READ = Firebird.ISOLATION_REPEATABLE_READ,
    ISOLATION_SERIALIZABLE = Firebird.ISOLATION_SERIALIZABLE,
    ISOLATION_READ_COMMITED_READ_ONLY = Firebird.ISOLATION_READ_COMMITED_READ_ONLY
}

class Pool {
    private URI: ConnectionURI;
    private poolSize: number;
    protected connPool: any
    constructor(URI: URI,) {
        const data = this.makeURI(URI);
        this.URI = data.URI;
        this.poolSize = data.pool;
        this.connPool = Firebird.pool(this.poolSize, this.URI)
    }

    public async get(): Promise<IPool> {
        return new Promise((resolve, reject) => {
            this.connPool.get((err: Error, conn: any) => {
                if (err) { reject(err) };

                resolve({
                    query: (query: string, parameters: (string | number | boolean | null)[]) => new Promise((resolve, reject) => {
                        conn.query(query, parameters, (err: Error, dataSet: any[]) => {
                            if(err) { reject(err) }
                            conn.detach((err: Error) => {
                                if (err) { reject(err) }
                            })

                            resolve(dataSet);
                        })
                    }),

                    execute: (query: string, parameters: (string | number | boolean | null)[]) => new Promise((resolve, reject) => {
                        conn.query(query, parameters, (err: Error, dataSet: any[]) => {
                            if(err) { reject(err) }
                            conn.detach((err: Error) => {
                                if (err) { reject(err) }
                            })

                            resolve(dataSet);
                        })
                    }),

                    close: () => new Promise((resolve, reject) => {
                        conn.detach((err: Error) => {
                            if (err) { reject(err) }
                        })

                        resolve();
                    }),

                    sequentially: (query: string, parameters: (string | number | boolean | null)[], fn: (row: any, index: number) => void) => new Promise((resolve, reject) => {
                        conn.sequentially(query, parameters, (row: any, index: number) => {
                            fn(row, index);
                            resolve()
                        }, (err: Error) => {
                            if(err) { reject(err) }
                        })
                    }),

                    transaction: (isolation: Transactions) => new Promise((resolve, reject) => {
                        conn.transaction(isolation, (err: Error, transaction: any) => {
                            if (err) { reject(err) }

                            resolve({
                                query: (query: string, parameters: (string | number | boolean | null)[]) => new Promise((resolve, reject) => {
                                    transaction.query(query, parameters, (err: Error, dataSet: any[]) => {
                                        if(err) { reject(err) }
            
                                        resolve(dataSet);
                                    })
                                }),

                                execute: (query: string, parameters: (string | number | boolean | null)[]) => new Promise((resolve, reject) => {
                                    transaction.query(query, parameters, (err: Error, dataSet: any[]) => {
                                        if(err) { reject(err) }
            
                                        resolve(dataSet);
                                    })
                                }),

                                commit: () => new Promise((resolve, reject) => {
                                    transaction.commit((err: Error) => {
                                        if(err) { reject (err) }
                                        resolve()
                                    })
                                }),

                                rollback: () => new Promise((resolve, reject) => {
                                    transaction.rollback((err: Error) => {
                                        if(err) { reject (err) }
                                        resolve()
                                    })
                                }),

                            })
                        })
                    }) 

                })
            })
        })
    }

    public async destroy(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.connPool.destroy((err: Error) => {
                if(err) { reject(err) }
                resolve();
            })
        })
    }

    private makeURI(URI: URI): ConnPool  {
       const options = this.getOptions(URI.options);
       const pool = URI.pool ? URI.pool : 1;

       return {
           pool,
           URI: {
            host: URI.host,
            port: URI.port,
            database: URI.database,
            user: URI.user,
            password: URI.password,
            ...options
           }
       }
    }

    private  getOptions(options?: ConnectionOptions): ConnectionOptions {
        return {
            lowercase_keys: options?.lowercase_keys ? options.lowercase_keys : true,
            role: options?.role ? options.role : null,
            pageSize: options?.pageSize ? options.pageSize : 4096
        }
    }
}

export default Pool;